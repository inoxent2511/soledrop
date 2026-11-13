import { bindActor } from "@/server/db/bind"
import { systemActor } from "@/server/db/actor"
import { ALL_PERMISSIONS } from "@/server/admin/permissions"
import type { AdminOperations } from "@/server/admin/repository"
import { beforeEach, describe, expect, it } from "vitest"

import { hashToken, newToken } from "@/server/admin/crypto"
import { createFixturesAdminRepository } from "@/server/admin/fixtures.repository"
import { createAdminService, LOCKOUT_AFTER, resolvePermissions, type RequestMeta } from "@/server/admin/service"
import { totpAt } from "@/server/admin/totp"
import type { StaffContext } from "@/server/admin/types"
import { STORE_ID } from "@/server/fixtures/seed"
import { resetFixtures } from "@/server/fixtures/store"
import type { AuditEntry } from "@/server/platform/types"

/** Staff auth and RBAC through the real service on the fixtures driver (A-001…A-008). */

const SECRET = "test-session-secret-0000000000000000000000"
const meta: RequestMeta = { ip: "203.0.113.9", userAgent: "vitest", requestId: "req-1" }
const PASSWORD = "correct horse battery staple"

let clockMs = Date.parse("2026-11-07T09:00:00Z")
let audits: Omit<AuditEntry, "id" | "at">[] = []
let windows = new Map<string, { start: number; count: number }>()

const repo = bindActor<AdminOperations>(createFixturesAdminRepository(() => clockMs), () => systemActor(STORE_ID, "auth:staff", ALL_PERMISSIONS))
const service = () =>
  createAdminService({
    repo,
    secret: SECRET,
    clock: () => clockMs,
    audit: async (entry) => void audits.push(entry),
    hit: async (key, windowSeconds) => {
      const current = windows.get(key)
      if (!current || current.start + windowSeconds * 1000 <= clockMs) {
        windows.set(key, { start: clockMs, count: 1 })
        return 1
      }
      current.count += 1
      return current.count
    },
  })
let admin = service()

const advance = (minutes: number) => {
  clockMs += minutes * 60_000
}

async function invite(email: string, roleKey: string) {
  const token = newToken()
  await repo.createInvite({ id: crypto.randomUUID(), storeId: STORE_ID, email, roleKey, tokenHash: hashToken(token), invitedBy: null, expiresAt: new Date(clockMs + 3_600_000).toISOString(), acceptedAt: null, revokedAt: null, createdAt: new Date(clockMs).toISOString() })
  return token
}

/** Accepts an invite and enrols MFA: returns an AAL2 token, the TOTP secret and the recovery codes. */
async function onboard(email: string, roleKey: string) {
  const first = await admin.acceptInvite(await invite(email, roleKey), { displayName: email.split("@")[0], password: PASSWORD }, meta)
  const { secret } = await admin.beginEnrolment(first.token)
  const { session, recoveryCodes } = await admin.confirmEnrolment(first.token, totpAt(secret, clockMs), meta)
  advance(1) // the next code is a new time step
  return { token: session.token, secret, recoveryCodes, first: first.token }
}

const contextOf = async (token: string) => (await admin.resolve(token)) as StaffContext

beforeEach(() => {
  resetFixtures()
  audits = []
  windows = new Map()
  admin = service()
})

describe("staff sign-in", () => {
  it("bootstraps an Owner from an invite, enforces MFA enrolment, and rotates the token at AAL2", async () => {
    const first = await admin.acceptInvite(await invite("owner@example.com", "owner"), { displayName: "Owner", password: PASSWORD }, meta)
    expect(first).toMatchObject({ aal: 1, needs: "enrol" })
    expect((await admin.resolve(first.token))?.session.aal).toBe(1)

    const { secret, uri } = await admin.beginEnrolment(first.token)
    expect(uri).toMatch(/^otpauth:\/\/totp\/Sole%20Drop%20Admin%3Aowner%40example\.com\?secret=/)
    await expect(admin.confirmEnrolment(first.token, "000000", meta)).rejects.toMatchObject({ code: "validation" })
    const { session, recoveryCodes } = await admin.confirmEnrolment(first.token, totpAt(secret, clockMs), meta)
    expect(session).toMatchObject({ aal: 2, needs: null })
    expect(recoveryCodes).toHaveLength(10)
    expect(await admin.resolve(first.token)).toBeNull()
    const staff = await contextOf(session.token)
    expect(staff.permissions).toContain("roles:manage")
    expect(staff.refundLimit).toBeNull()
    expect(audits.map((entry) => entry.action)).toEqual(["staff.invite_accepted", "staff.mfa_enrolled"])
    expect(audits[0]).toMatchObject({ ip: meta.ip, userAgent: "vitest", requestId: "req-1", storeId: STORE_ID })
  })

  it("refuses used, revoked and expired invites, and weak passwords", async () => {
    const token = await invite("new@example.com", "support_agent")
    await expect(admin.acceptInvite(token, { displayName: "New", password: "short" }, meta)).rejects.toMatchObject({ code: "validation" })
    await admin.acceptInvite(token, { displayName: "New", password: PASSWORD }, meta)
    await expect(admin.acceptInvite(token, { displayName: "New", password: PASSWORD }, meta)).rejects.toMatchObject({ code: "not_found" })
    const late = await invite("late@example.com", "support_agent")
    advance(61)
    expect(await admin.peekInvite(late)).toBeNull()
    await expect(admin.acceptInvite(late, { displayName: "Late", password: PASSWORD }, meta)).rejects.toMatchObject({ code: "not_found" })
  })

  it("asks enrolled staff for a code, refuses replays, and spends a recovery code once", async () => {
    const { secret, recoveryCodes } = await onboard("owner@example.com", "owner")
    const login = await admin.login(STORE_ID, "OWNER@example.com", PASSWORD, meta)
    expect(login).toMatchObject({ aal: 1, needs: "verify" })
    const code = totpAt(secret, clockMs)
    const verified = await admin.verifyMfa(login.token, code, meta)
    expect(verified.aal).toBe(2)

    const again = await admin.login(STORE_ID, "owner@example.com", PASSWORD, meta)
    await expect(admin.verifyMfa(again.token, code, meta)).rejects.toMatchObject({ code: "validation" })
    expect((await admin.verifyMfa(again.token, recoveryCodes[0], meta)).aal).toBe(2)
    const third = await admin.login(STORE_ID, "owner@example.com", PASSWORD, meta)
    await expect(admin.verifyMfa(third.token, recoveryCodes[0], meta)).rejects.toMatchObject({ code: "validation" })
  })

  it("gives the same answer for unknown emails and wrong passwords, and locks after repeated failures", async () => {
    await onboard("owner@example.com", "owner")
    const unknown = await admin.login(STORE_ID, "nobody@example.com", PASSWORD, meta).catch((error) => error)
    const wrong = await admin.login(STORE_ID, "owner@example.com", "wrong password!!", meta).catch((error) => error)
    expect(unknown.message).toBe(wrong.message)
    for (let attempt = 1; attempt < LOCKOUT_AFTER; attempt++) await admin.login(STORE_ID, "owner@example.com", "wrong password!!", { ...meta, ip: `198.51.100.${attempt}` }).catch(() => null)
    await expect(admin.login(STORE_ID, "owner@example.com", PASSWORD, { ...meta, ip: "198.51.100.50" })).rejects.toMatchObject({ code: "rate_limited" })
    expect(audits.some((entry) => entry.action === "staff.locked_out")).toBe(true)
    advance(16)
    await expect(admin.login(STORE_ID, "owner@example.com", PASSWORD, { ...meta, ip: "198.51.100.51" })).resolves.toMatchObject({ aal: 1 })
  })

  it("does not block a real owner behind a shared proxy, but still caps network spraying and MFA", async () => {
    const { first } = await onboard("owner@example.com", "owner")
    expect(first).toBeTruthy()
    for (let attempt = 0; attempt < 12; attempt++) await admin.login(STORE_ID, `x${attempt}@example.com`, PASSWORD, meta).catch(() => null)
    await expect(admin.login(STORE_ID, "owner@example.com", PASSWORD, meta)).resolves.toMatchObject({ aal: 1 })
    windows.set(`admin-login-ip:${meta.ip}`, { start: clockMs, count: 120 })
    await expect(admin.login(STORE_ID, "owner@example.com", PASSWORD, meta)).rejects.toMatchObject({ code: "rate_limited" })
    const login = await admin.login(STORE_ID, "owner@example.com", PASSWORD, { ...meta, ip: "192.0.2.1" })
    for (let attempt = 0; attempt < 5; attempt++) await admin.verifyMfa(login.token, "123456", meta).catch(() => null)
    await expect(admin.verifyMfa(login.token, "123456", meta)).rejects.toMatchObject({ code: "rate_limited" })
  })

  it("does not lock an account after repeated successful password sign-ins", async () => {
    await onboard("owner@example.com", "owner")
    for (let attempt = 0; attempt <= LOCKOUT_AFTER; attempt++) {
      await expect(admin.login(STORE_ID, "owner@example.com", PASSWORD, { ...meta, ip: `198.51.100.${attempt}` })).resolves.toMatchObject({ aal: 1 })
    }
  })

  it("does not share an IP login cap when the proxy did not provide a client address", async () => {
    await onboard("owner@example.com", "owner")
    for (let attempt = 0; attempt < 11; attempt++) {
      await admin.login(STORE_ID, `unknown${attempt}@example.com`, PASSWORD, { ...meta, ip: "direct" }).catch(() => null)
    }
    await expect(admin.login(STORE_ID, "owner@example.com", PASSWORD, { ...meta, ip: "direct" })).resolves.toMatchObject({ aal: 1 })
  })

  it("clears an old lock when the signed-in owner changes their password", async () => {
    const owner = await onboard("owner@example.com", "owner")
    for (let attempt = 0; attempt < LOCKOUT_AFTER; attempt++) {
      await admin.login(STORE_ID, "owner@example.com", "incorrect password", { ...meta, ip: `198.51.100.${attempt}` }).catch(() => null)
    }
    const staff = await contextOf(owner.token)
    const nextPassword = "a new and different secure password"
    await admin.changePassword(staff, PASSWORD, nextPassword, meta)
    const member = await repo.findMember(STORE_ID, staff.member.userId)
    expect(member?.lockedUntil).toBeNull()
    expect(member?.failedLogins).toBe(0)
    await expect(admin.login(STORE_ID, "owner@example.com", nextPassword, { ...meta, ip: "198.51.100.50" })).resolves.toMatchObject({ aal: 1 })
  })

  it("ends sessions after 30 idle minutes and 12 hours in all; password-only sessions after 15 minutes", async () => {
    const { token } = await onboard("owner@example.com", "owner")
    advance(28) // onboard() already moved the clock one minute
    expect(await admin.resolve(token)).not.toBeNull()
    advance(31)
    expect(await admin.resolve(token)).toBeNull()

    const login = await admin.login(STORE_ID, "owner@example.com", PASSWORD, meta)
    advance(16)
    expect(await admin.resolve(login.token)).toBeNull()

    // Password-only sessions never outlive MFA_PENDING_MINUTES, however active.
    const fresh = await admin.login(STORE_ID, "owner@example.com", PASSWORD, meta)
    for (let step = 0; step < 3; step++) {
      advance(4)
      expect(await admin.resolve(fresh.token)).not.toBeNull()
    }
    advance(4)
    expect(await admin.resolve(fresh.token)).toBeNull()
  })

  it("caps an active AAL2 session at 12 hours", async () => {
    const { token } = await onboard("owner@example.com", "owner")
    for (let step = 0; step < 28; step++) {
      advance(25)
      expect(await admin.resolve(token), `after ${(step + 1) * 25} minutes`).not.toBeNull()
    }
    advance(25)
    expect(await admin.resolve(token)).toBeNull()
  })
})

describe("staff and roles", () => {
  it("needs a fresh second factor for sensitive actions", async () => {
    const owner = await onboard("owner@example.com", "owner")
    advance(11)
    const staff = await contextOf(owner.token)
    await expect(admin.invite(staff, { email: "a@example.com", roleKey: "support_agent" }, meta)).rejects.toMatchObject({ code: "forbidden", details: { stepUp: true } })
    await admin.stepUp(staff, totpAt(owner.secret, clockMs), meta)
    const result = await admin.invite(await contextOf(owner.token), { email: "a@example.com", roleKey: "support_agent" }, meta)
    expect(result.path).toMatch(/^\/admin\/invite\/[\w-]{43}$/)
  })

  it("keeps staff inside their permissions and blocks privilege escalation", async () => {
    const owner = await onboard("owner@example.com", "owner")
    const support = await onboard("support@example.com", "support_agent")
    const supportStaff = await contextOf(support.token)
    expect(supportStaff.permissions).not.toContain("staff:read")
    expect(supportStaff.refundLimit).toBe(500_000)
    await expect(admin.listStaff(supportStaff)).rejects.toMatchObject({ code: "forbidden" })
    await expect(admin.invite(supportStaff, { email: "b@example.com", roleKey: "owner" }, meta)).rejects.toMatchObject({ code: "forbidden" })

    const adminUser = await onboard("admin@example.com", "admin")
    const adminStaff = await contextOf(adminUser.token)
    await expect(admin.setStaffRoles(adminStaff, supportStaff.member.userId, ["owner"], meta, null)).rejects.toMatchObject({ code: "forbidden", message: "Only an Owner can make someone an Owner." })
    const ownerStaff = await contextOf(owner.token)
    await expect(admin.setStaffStatus(adminStaff, ownerStaff.member.userId, "suspended", meta, null)).rejects.toMatchObject({ code: "forbidden" })

    // A custom role can't carry permissions its creator lacks.
    const manager = await onboard("manager@example.com", "store_manager")
    const managerStaff = await contextOf(manager.token)
    await expect(admin.saveRole(managerStaff, { name: "Sneaky", description: "", refundLimit: null, permissions: ["staff:manage"] }, meta)).rejects.toMatchObject({ code: "forbidden" })
  })

  it("never leaves the store without an active Owner", async () => {
    const owner = await onboard("owner@example.com", "owner")
    const staff = await contextOf(owner.token)
    await expect(admin.setStaffRoles(staff, staff.member.userId, ["admin"], meta, "handover")).rejects.toMatchObject({ code: "conflict" })
    const second = await onboard("second@example.com", "admin")
    const secondStaff = await contextOf(second.token)
    await admin.setStaffRoles(await contextOf(owner.token), secondStaff.member.userId, ["owner"], meta, "handover")
    await admin.setStaffRoles(await contextOf(owner.token), staff.member.userId, ["admin"], meta, "handover")
    expect(await repo.countActiveOwners(STORE_ID)).toBe(1)
  })

  it("signs a member out everywhere when their roles change or they are suspended", async () => {
    const owner = await onboard("owner@example.com", "owner")
    const support = await onboard("support@example.com", "support_agent")
    const supportId = (await contextOf(support.token)).member.userId
    await admin.setStaffRoles(await contextOf(owner.token), supportId, ["fulfilment"], meta, "moved team")
    expect(await admin.resolve(support.token)).toBeNull()

    const relogin = await admin.login(STORE_ID, "support@example.com", PASSWORD, meta)
    const upgraded = await admin.verifyMfa(relogin.token, totpAt(support.secret, clockMs), meta)
    expect((await contextOf(upgraded.token)).permissions).toContain("orders:fulfil")
    await admin.setStaffStatus(await contextOf(owner.token), supportId, "suspended", meta, "left")
    expect(await admin.resolve(upgraded.token)).toBeNull()
    await expect(admin.login(STORE_ID, "support@example.com", PASSWORD, meta)).rejects.toMatchObject({ code: "unauthorized" })
    expect(audits.find((entry) => entry.action === "staff.suspended")).toMatchObject({ reason: "left", before: { status: "active" }, after: { status: "suspended" } })
  })

  it("manages custom roles with optimistic concurrency and protects system roles", async () => {
    const owner = await onboard("owner@example.com", "owner")
    const staff = await contextOf(owner.token)
    const role = await admin.saveRole(staff, { name: "Night shift", description: "Orders only", refundLimit: 100_000, permissions: ["orders:read", "orders:fulfil"] }, meta)
    expect(role).toMatchObject({ key: "night_shift", isSystem: false })
    advance(0.01)
    await admin.saveRole(staff, { key: role.key, name: "Night shift", description: "", refundLimit: 0, permissions: ["orders:read"] }, meta, role.updatedAt)
    await expect(admin.saveRole(staff, { key: role.key, name: "Stale", description: "", refundLimit: 0, permissions: [] }, meta, role.updatedAt)).rejects.toMatchObject({ code: "conflict" })
    await expect(admin.saveRole(staff, { key: "owner", name: "Boss", description: "", refundLimit: 0, permissions: [] }, meta)).rejects.toMatchObject({ code: "forbidden" })
    await expect(admin.deleteRole(staff, "support_agent", meta)).rejects.toMatchObject({ code: "forbidden" })
    await expect(admin.saveRole(staff, { name: "Bad", description: "", refundLimit: 0, permissions: ["orders:everything"] }, meta)).rejects.toMatchObject({ code: "validation" })
    await admin.deleteRole(staff, role.key, meta)
    expect(audits.filter((entry) => entry.entity === "role").map((entry) => entry.action)).toEqual(["role.created", "role.updated", "role.deleted"])
  })

  it("resets a lost authenticator: the member enrols again at next sign-in", async () => {
    const owner = await onboard("owner@example.com", "owner")
    const support = await onboard("support@example.com", "support_agent")
    const supportId = (await contextOf(support.token)).member.userId
    await admin.resetMfa(await contextOf(owner.token), supportId, meta, "lost phone")
    expect(await admin.resolve(support.token)).toBeNull()
    expect(await admin.login(STORE_ID, "support@example.com", PASSWORD, meta)).toMatchObject({ needs: "enrol" })
  })
})

describe("permission resolution", () => {
  it("unions roles and takes the highest refund ceiling among roles that may refund", () => {
    expect(resolvePermissions([{ permissions: ["orders:read"], refundLimit: null }])).toEqual({ permissions: ["orders:read"], refundLimit: 0 })
    expect(resolvePermissions([{ permissions: ["orders:refund"], refundLimit: 500 }, { permissions: ["orders:refund", "orders:read"], refundLimit: 900 }]).refundLimit).toBe(900)
    expect(resolvePermissions([{ permissions: ["orders:refund"], refundLimit: 500 }, { permissions: ["orders:refund"], refundLimit: null }]).refundLimit).toBeNull()
  })
})
