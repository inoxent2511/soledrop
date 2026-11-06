import "server-only"

import { randomUUID } from "node:crypto"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

import { secureCookies, serverEnv } from "@/lib/env.server"
import { adminService, type RequestMeta, type StaffContext } from "@/server/admin"
import type { Permission } from "@/server/admin/permissions"
import { forwardedClient } from "@/server/http/client-key"
import { DomainError } from "@/server/shared/errors"

/**
 * The admin data-access layer (A-006 layer 2). Every admin page and handler calls one of these
 * before touching data; proxy.ts only does an optimistic cookie check, and RLS is the backstop.
 */

export const STAFF_COOKIE = "sd_staff"

export async function setStaffCookie(token: string, expiresAt: string) {
  ;(await cookies()).set(STAFF_COOKIE, token, { httpOnly: true, sameSite: "strict", path: "/", secure: secureCookies(serverEnv), expires: new Date(expiresAt) })
}

export async function clearStaffCookie() {
  ;(await cookies()).delete(STAFF_COOKIE)
}

export async function staffToken(): Promise<string | undefined> {
  return (await cookies()).get(STAFF_COOKIE)?.value
}

/** IP, user agent and a request id for sessions and audit entries. */
export async function requestMeta(): Promise<RequestMeta> {
  const list = await headers()
  return {
    ip: forwardedClient(list.get("x-forwarded-for"), serverEnv.TRUSTED_PROXY_HOPS) || null,
    userAgent: list.get("user-agent"),
    requestId: list.get("x-request-id") ?? randomUUID(),
  }
}

/** The staff member behind this request (any assurance level); resolved once per request. */
export const currentStaff = cache(async (): Promise<StaffContext | null> => adminService().resolve(await staffToken()))

export const can = (staff: StaffContext, permission: Permission) => staff.permissions.includes(permission)

// ─── Route handlers: throw DomainErrors the route() wrapper maps to 401/403 ──

export async function requireStaff(): Promise<StaffContext> {
  const staff = await currentStaff()
  if (!staff) throw new DomainError("unauthorized", "Please sign in to the admin.")
  if (staff.session.aal !== 2) throw new DomainError("unauthorized", "Finish two-step verification first.", { mfa: true })
  return staff
}

export async function requirePermission(permission: Permission): Promise<StaffContext> {
  const staff = await requireStaff()
  if (!can(staff, permission)) throw new DomainError("forbidden", "You don't have permission to do that.", { permission })
  return staff
}

/** For sensitive actions: the permission and a second factor proven in the last 10 minutes (A-003). */
export async function requireStepUp(permission: Permission): Promise<StaffContext> {
  const staff = await requirePermission(permission)
  adminService().assertSteppedUp(staff)
  return staff
}

// ─── Pages: redirect instead of throwing ─────────────────────────────────────

/** Signed in at AAL2, or off to sign-in / MFA. */
export async function staffPage(next = "/admin"): Promise<StaffContext> {
  const staff = await currentStaff()
  if (!staff) redirect(`/admin/login?next=${encodeURIComponent(next)}`)
  if (staff.session.aal !== 2) redirect(staff.member.totpEnabledAt ? "/admin/mfa" : "/admin/mfa/setup")
  return staff
}

/** The page's permission, or the no-access page naming what is missing. */
export async function permissionPage(permission: Permission, next?: string): Promise<StaffContext> {
  const staff = await staffPage(next)
  if (!can(staff, permission)) redirect(`/admin/no-access?need=${encodeURIComponent(permission)}`)
  return staff
}
