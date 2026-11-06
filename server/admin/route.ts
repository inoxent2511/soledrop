import "server-only"

import { headers } from "next/headers"

import { publicEnv } from "@/lib/env"
import { adminService } from "@/server/admin"
import { currentStaff, requestMeta, requirePermission, requireStaff } from "@/server/admin/dal"
import type { RequestMeta } from "@/server/admin/service"
import type { Permission } from "@/server/admin/permissions"
import type { StaffContext } from "@/server/admin/types"
import { errorResponse } from "@/server/http/route"
import { platform } from "@/server/platform"
import { DomainError } from "@/server/shared/errors"

/**
 * Every admin route handler is wrapped in `adminRoute(access, handler)`; an architecture test fails
 * when one isn't. `access` is declared up front so a handler can't forget its check:
 *
 * - a Permission (or `{ permission, stepUp: true }` for sensitive actions, A-003): AAL2 staff holding it;
 * - "staff": any AAL2 staff member (their own account, notifications);
 * - "pending": any live staff session, including AAL1 (finishing MFA);
 * - "public": no session (sign-in, accepting an invite).
 *
 * Mutations must carry our own Origin (CSRF, on top of SameSite=Strict), and nothing is cached.
 */
export type AdminAccess = Permission | { permission: Permission; stepUp: true } | "staff" | "pending" | "public"

const WRITES_PER_MINUTE = 120

type Handler<Context, Staff> = (input: { request: Request; context: Context; staff: Staff; meta: RequestMeta }) => Promise<Response>

async function assertOwnOrigin(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return
  const origin = request.headers.get("origin")
  const host = (await headers()).get("host")
  const allowed = new Set([new URL(publicEnv.NEXT_PUBLIC_SITE_URL).host, host])
  if (!origin || !allowed.has(new URL(origin).host)) throw new DomainError("forbidden", "Cross-site request blocked.")
}

async function authorise(access: AdminAccess): Promise<StaffContext | null> {
  if (access === "public") return null
  if (access === "pending") {
    const staff = await currentStaff()
    if (!staff) throw new DomainError("unauthorized", "Your sign-in expired. Please sign in again.")
    return staff
  }
  if (access === "staff") return requireStaff()
  if (typeof access === "string") return requirePermission(access)
  const staff = await requirePermission(access.permission)
  adminService().assertSteppedUp(staff)
  return staff
}

export function adminRoute<Context = unknown>(access: "public", handler: Handler<Context, null>): (request: Request, context: Context) => Promise<Response>
export function adminRoute<Context = unknown>(access: Exclude<AdminAccess, "public">, handler: Handler<Context, StaffContext>): (request: Request, context: Context) => Promise<Response>
export function adminRoute<Context = unknown>(access: AdminAccess, handler: Handler<Context, null> | Handler<Context, StaffContext>) {
  return async (request: Request, context: Context) => {
    try {
      await assertOwnOrigin(request)
      const staff = await authorise(access)
      // A runaway script or stolen session can't hammer writes: 120 per minute per session.
      if (staff && request.method !== "GET" && request.method !== "HEAD" && (await platform().hit(`admin-write:${staff.session.id}`, 60)) > WRITES_PER_MINUTE) {
        throw new DomainError("rate_limited", "Too many changes in a minute. Please wait a moment.", { retryAfter: 60 })
      }
      // authorise() returns null exactly for "public", matching the overload the handler was typed with.
      const response = await (handler as Handler<Context, StaffContext | null>)({ request, context, staff, meta: await requestMeta() })
      response.headers.set("cache-control", "private, no-store")
      return response
    } catch (error) {
      const response = errorResponse(error)
      response.headers.set("cache-control", "private, no-store")
      return response
    }
  }
}
