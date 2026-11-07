import "server-only"

import { hashToken, newRecoveryCodes, newToken, sameTokenHash, seal, unseal } from "@/server/admin/crypto"
import { ALL_PERMISSIONS, OWNER_ROLE_KEY, PERMISSIONS, PRESET_ROLES, isPermission, isSensitive, type Permission } from "@/server/admin/permissions"
import type { AdminRepository } from "@/server/admin/repository"
import { generateTotpSecret, otpauthUri, verifyTotp } from "@/server/admin/totp"
import type { Role, StaffContext, StaffMember, StaffSession, StaffSummary } from "@/server/admin/types"
import { decoyHash, hashPassword, passwordNeedsRehash, verifyPassword } from "@/server/customers/password"
import type { AuditEntry } from "@/server/platform/types"
import { DomainError } from "@/server/shared/errors"
import { newId } from "@/server/shared/ids"
import { direct, type Atomic } from "@/server/shared/atomic"
import { assertPasswordPolicy } from "@/server/customers/password-policy"

/**
 * Staff identity, sessions and RBAC (docs/app/admin/admin-decisions.md A-001…A-008). Every admin
 * mutation in every module goes through a domain service and records an audit entry with
 * `recordAudit`; this service owns who may act.
 */

export const SESSION_IDLE_MINUTES = 30
export const SESSION_ABSOLUTE_HOURS = 12
/** A password-only session exists just to finish MFA. */
export const MFA_PENDING_MINUTES = 15
export const STEP_UP_MINUTES = 10
export const INVITE_HOURS = 72
export const LOCKOUT_AFTER = 5
export const LOCKOUT_MINUTES = 15
const LAST_SEEN_THROTTLE_MS = 60_000
const ISSUER = "Sole Drop Admin"

const BAD_LOGIN = "That email and password don't match."
const BAD_CODE = "That code didn't work. Check your authenticator app and try again."

/** Where a request came from; stored on sessions and audit entries. */
export type RequestMeta = { ip: string | null; userAgent: string | null; requestId: string | null }

type Deps = {
  repo: AdminRepository
  /** Fixed-window counter (platform.hit); returns the count after incrementing. */
  hit: (key: string, windowSeconds: number) => Promise<number>
  audit: (entry: Omit<AuditEntry, "id" | "at">) => Promise<void>
  /** Seals TOTP secrets at rest (SESSION_SECRET). */
  secret: string
  rehashPassword?: (member: StaffMember, passwordHash: string) => Promise<void>
  clock?: () => number
  atomic?: Atomic
  notifySecurity?: (email: string, action: string) => Promise<void>
  allowIp?: (ip: string | null) => boolean
}

export type IssuedSession = { token: string; expiresAt: string; aal: 1 | 2; needs: "enrol" | "verify" | null }

const minutes = (count: number) => count * 60_000

export function passwordProblem(password: string, email: string): string | null {
  if (password.length < 12) return "Use at least 12 characters."
  if (password.length > 200) return "Use at most 200 characters."
  if (password.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length >= 4) return "Don't use your email in your password."
  return null
}

/** Union of the roles' permissions, and the highest refund ceiling among roles that may refund. */
export function resolvePermissions(roles: Pick<Role, "permissions" | "refundLimit">[]): { permissions: Permission[]; refundLimit: number | null } {
  const granted = new Set(roles.flatMap((role) => role.permissions).filter(isPermission))
  const refunders = roles.filter((role) => role.permissions.includes("orders:refund"))
  const refundLimit = refunders.length === 0 ? 0 : refunders.some((role) => role.refundLimit === null) ? null : Math.max(...refunders.map((role) => role.refundLimit ?? 0))
  return { permissions: ALL_PERMISSIONS.filter((key) => granted.has(key)), refundLimit }
}

export const toSummary = (member: StaffMember, roles: Pick<Role, "key" | "name">[]): StaffSummary => ({
  userId: member.userId,
  email: member.email,
  displayName: member.displayName,
  status: member.status,
  mfa: member.totpEnabledAt !== null,
  roles: roles.map((role) => ({ key: role.key, name: role.name })),
  lastSeenAt: member.lastSeenAt,
  createdAt: member.createdAt,
})

export function createAdminService(deps: Deps) {
  const { repo } = deps
  const clock = deps.clock ?? Date.now
  const atomic = deps.atomic ?? direct
  const iso = (at = clock()) => new Date(at).toISOString()
  const synced = new Set<string>()

  async function ensureRegistry(storeId: string) {
    if (synced.has(storeId)) return
    await repo.syncRegistry(
      storeId,
      ALL_PERMISSIONS.map((key) => ({ key, label: PERMISSIONS[key].label, group: PERMISSIONS[key].group, sensitive: isSensitive(key) })),
      PRESET_ROLES,
    )
    synced.add(storeId)
  }

  async function limit(key: string, max: number, windowSeconds: number, message = "Too many attempts. Please wait a few minutes and try again.") {
    if ((await deps.hit(key, windowSeconds)) > max) throw new DomainError("rate_limited", message, { retryAfter: windowSeconds })
  }

  async function issueSession(member: StaffMember, aal: 1 | 2, meta: RequestMeta, provenMfaAt?: string): Promise<IssuedSession> {
    const token = newToken()
    const at = clock()
    const expiresAt = iso(at + (aal === 2 ? SESSION_ABSOLUTE_HOURS * 3_600_000 : minutes(MFA_PENDING_MINUTES)))
    await repo.createSession({
      id: newId(),
      userId: member.userId,
      storeId: member.storeId,
      tokenHash: hashToken(token),
      aal,
      mfaAt: aal === 2 ? provenMfaAt ?? iso(at) : null,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      createdAt: iso(at),
      lastSeenAt: iso(at),
      expiresAt,
      revokedAt: null,
    })
    return { token, expiresAt, aal, needs: aal === 2 ? null : member.totpEnabledAt ? "verify" : "enrol" }
  }

  /** A live session and its active member, or null (expired, idle, revoked, suspended). */
  async function liveSession(token: string | undefined): Promise<{ session: StaffSession; member: StaffMember } | null> {
    if (!token) return null
    const session = await repo.findSessionByTokenHash(hashToken(token))
    if (!session || session.revokedAt) return null
    const at = clock()
    const absolute = session.aal === 2 ? SESSION_ABSOLUTE_HOURS * 3_600_000 : minutes(MFA_PENDING_MINUTES)
    if (Date.parse(session.expiresAt) <= at || Date.parse(session.createdAt) + absolute <= at || Date.parse(session.lastSeenAt) + minutes(SESSION_IDLE_MINUTES) <= at) {
      await repo.updateSession(session.id, { revokedAt: iso(at) })
      return null
    }
    const member = await repo.findMember(session.storeId, session.userId)
    if (!member || member.status !== "active" || session.aal === 2 && (!session.mfaAt || !member.totpEnabledAt || Date.parse(session.mfaAt) > at + 30_000)) return null
    return { session, member }
  }

  /** Swaps a session for a fresh token at AAL2 (no fixation across the privilege change). */
  async function upgrade(session: StaffSession, member: StaffMember, meta: RequestMeta) {
    await repo.updateSession(session.id, { revokedAt: iso() })
    return issueSession(member, 2, meta)
  }

  async function context(session: StaffSession, member: StaffMember): Promise<StaffContext> {
    await ensureRegistry(member.storeId)
    const roles = await repo.rolesOf(member.storeId, member.userId)
    const { permissions, refundLimit } = resolvePermissions(roles)
    return {
      member: { userId: member.userId, storeId: member.storeId, email: member.email, displayName: member.displayName, status: member.status, totpEnabledAt: member.totpEnabledAt },
      session: { id: session.id, aal: session.aal, mfaAt: session.mfaAt, createdAt: session.createdAt, expiresAt: session.expiresAt },
      roles: roles.map((role) => ({ id: role.id, key: role.key, name: role.name, refundLimit: role.refundLimit })),
      permissions,
      refundLimit,
    }
  }

  /** Checks a TOTP code (not a replay) or consumes a recovery code. */
  async function checkSecondFactor(member: StaffMember, code: string): Promise<boolean> {
    if (!member.totpSecret || !member.totpEnabledAt) return false
    const cleaned = code.replace(/\s/g, "")
    if (/^\d{6}$/.test(cleaned)) {
      const step = verifyTotp(unseal(member.totpSecret, deps.secret), cleaned, clock())
      if (step === null || (member.totpLastStep !== null && step <= member.totpLastStep)) return false
      try { await repo.updateMember(member.storeId, member.userId, { totpLastStep: step }, member.updatedAt); return true }
      catch (error) { if (error instanceof DomainError && ["conflict", "unauthorized"].includes(error.code)) return false; throw error }
    }
    const hashed = hashToken(cleaned.toLowerCase())
    let matched = -1
    member.recoveryCodes.forEach((entry, index) => { if (sameTokenHash(entry, hashed)) matched = index })
    if (matched < 0) return false
    try { await repo.updateMember(member.storeId, member.userId, { recoveryCodes: member.recoveryCodes.filter((_entry, index) => index !== matched) }, member.updatedAt); return true }
    catch (error) { if (error instanceof DomainError && ["conflict", "unauthorized"].includes(error.code)) return false; throw error }
  }

  async function recordAudit(actor: StaffContext | null, meta: RequestMeta, entry: { action: string; entity: string; entityId: string; before?: unknown; after?: unknown; reason?: string | null; storeId: string; actorId?: string }) {
      await deps.audit({
        actor: actor?.member.userId ?? entry.actorId ?? "system",
        actorRole: actor ? actor.roles.map((role) => role.key).join(",") : null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: entry.before ?? null,
        after: entry.after ?? null,
        storeId: entry.storeId,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        requestId: meta.requestId,
        reason: entry.reason ?? null,
      })
  }

  const requireIn = (staff: StaffContext, permission: Permission) => {
    if (!staff.permissions.includes(permission)) throw new DomainError("forbidden", "You don't have permission to do that.")
  }

  /** Sensitive actions need a second factor within the last STEP_UP_MINUTES (A-003). */
  const assertSteppedUp = (staff: StaffContext) => {
    if (!staff.session.mfaAt || Date.parse(staff.session.mfaAt) + minutes(STEP_UP_MINUTES) < clock()) {
      throw new DomainError("forbidden", "Confirm it's you with your authenticator code to continue.", { stepUp: true })
    }
  }

  async function memberAndRoles(storeId: string, userId: string) {
    const member = await repo.findMember(storeId, userId)
    if (!member) throw new DomainError("not_found", "Staff member not found.")
    return { member, roles: await repo.rolesOf(storeId, userId) }
  }

  /** Non-Owners may only hand out permissions they hold themselves (no escalation). */
  function assertCanGrant(staff: StaffContext, permissions: readonly Permission[], roleKeys: readonly string[] = []) {
    const isOwner = staff.roles.some((role) => role.key === OWNER_ROLE_KEY)
    if (isOwner) return
    if (roleKeys.includes(OWNER_ROLE_KEY)) throw new DomainError("forbidden", "Only an Owner can make someone an Owner.")
    const missing = permissions.filter((permission) => !staff.permissions.includes(permission))
    if (missing.length > 0) throw new DomainError("forbidden", "You can't grant permissions you don't have yourself.", { missing })
  }

  return {
    ensureRegistry,
    recordAudit,
    assertSteppedUp,

    /** Password step (A-005). Same error for unknown email, wrong password and disabled accounts. */
    async login(storeId: string, emailAddress: string, password: string, meta: RequestMeta): Promise<IssuedSession> {
      if (deps.allowIp && !deps.allowIp(meta.ip)) {
        await recordAudit(null, meta, { action: "staff.network_denied", entity: "staff", entityId: "network-policy", storeId })
        throw new DomainError("forbidden", "Admin access isn't available from this network.")
      }
      const email = emailAddress.trim().toLowerCase()
      await limit(`admin-login-ip:${meta.ip ?? "unknown"}`, 10, 300)
      await limit(`admin-login-email:${email}`, LOCKOUT_AFTER, LOCKOUT_MINUTES * 60)
      await ensureRegistry(storeId)
      const member = await repo.findMemberByEmail(storeId, email)
      const valid = await verifyPassword(password, member?.passwordHash || (await decoyHash()))
      if (member?.lockedUntil && Date.parse(member.lockedUntil) > clock()) {
        throw new DomainError("unauthorized", BAD_LOGIN)
      }
      if (!member || !valid || member.status !== "active") {
        await atomic(async () => {
          const current = member ? await repo.findMember(storeId, member.userId) : null
          if (current && (!current.lockedUntil || Date.parse(current.lockedUntil) <= clock())) {
            const failedLogins = (current.lockedUntil ? 0 : current.failedLogins) + 1
            await repo.updateMember(storeId, current.userId, { failedLogins, lockedUntil: failedLogins >= LOCKOUT_AFTER ? iso(clock() + minutes(LOCKOUT_MINUTES)) : null })
            if (failedLogins === LOCKOUT_AFTER) await recordAudit(null, meta, { action: "staff.locked_out", entity: "staff", entityId: current.userId, storeId, actorId: current.userId })
          }
          await recordAudit(null, meta, { action: "staff.login_failed", entity: "staff", entityId: member?.userId ?? hashToken(email), storeId, actorId: member?.userId })
        })
        throw new DomainError("unauthorized", BAD_LOGIN)
      }
      return atomic(async () => {
      const current = await repo.findMember(storeId, member.userId)
      if (!current || current.status !== "active" || current.passwordHash !== member.passwordHash || current.lockedUntil && Date.parse(current.lockedUntil) > clock()) throw new DomainError("unauthorized", BAD_LOGIN)
      await repo.updateMember(storeId, member.userId, { failedLogins: 0, lockedUntil: null })
      if (member.passwordHash && passwordNeedsRehash(member.passwordHash)) {
        const passwordHash = await hashPassword(password)
        if (deps.rehashPassword) await deps.rehashPassword(member, passwordHash)
        else await repo.updateMember(storeId, member.userId, { passwordHash })
      }
      await recordAudit(null, meta, { action: "staff.signed_in", entity: "staff", entityId: member.userId, storeId, actorId: member.userId })
      return issueSession(member, 1, meta)
      })
    },

    /** The signed-in staff member, or null. AAL1 sessions resolve too, so they can finish MFA. */
    async resolve(token: string | undefined): Promise<StaffContext | null> {
      const live = await liveSession(token)
      if (!live) return null
      const at = clock()
      if (Date.parse(live.session.lastSeenAt) + LAST_SEEN_THROTTLE_MS < at) {
        await repo.updateSession(live.session.id, { lastSeenAt: iso(at) })
        await repo.updateMember(live.member.storeId, live.member.userId, { lastSeenAt: iso(at) })
      }
      return context(live.session, live.member)
    },

    async logout(token: string | undefined) {
      return atomic(async () => {
      const live = await liveSession(token)
      if (live) await repo.updateSession(live.session.id, { revokedAt: iso() })
      })
    },

    /** Starts (or restarts) TOTP enrolment on an AAL1 session of a member without MFA. */
    async beginEnrolment(token: string | undefined) {
      return atomic(async () => {
      const live = await liveSession(token)
      if (!live) throw new DomainError("unauthorized", "Your sign-in expired. Please sign in again.")
      if (live.member.totpEnabledAt) throw new DomainError("conflict", "Two-step verification is already set up.")
      const secret = generateTotpSecret()
      await repo.updateMember(live.member.storeId, live.member.userId, { totpSecret: seal(secret, deps.secret), totpLastStep: null })
      return { secret, uri: otpauthUri(secret, live.member.email, ISSUER) }
      })
    },

    /** Confirms enrolment with a first code: MFA on, recovery codes issued once, session upgraded. */
    async confirmEnrolment(token: string | undefined, code: string, meta: RequestMeta) {
      const live = await liveSession(token)
      if (!live) throw new DomainError("unauthorized", "Your sign-in expired. Please sign in again.")
      await limit(`admin-mfa:${live.session.id}`, 5, 300)
      return atomic(async () => {
      const current = await liveSession(token)
      if (!current) throw new DomainError("unauthorized", "Your sign-in expired. Please sign in again.")
      const { member, session } = current
      if (member.totpEnabledAt || !member.totpSecret) throw new DomainError("conflict", "Start setting up two-step verification first.")
      const step = verifyTotp(unseal(member.totpSecret, deps.secret), code.replace(/\s/g, ""), clock())
      if (step === null) throw new DomainError("validation", BAD_CODE)
      const codes = newRecoveryCodes()
      const enrolled = await repo.updateMember(member.storeId, member.userId, { totpEnabledAt: iso(), totpLastStep: step, recoveryCodes: codes.map((entry) => hashToken(entry)) }, member.updatedAt)
      await recordAudit(null, meta, { action: "staff.mfa_enrolled", entity: "staff", entityId: member.userId, storeId: member.storeId, actorId: member.userId })
      return { session: await upgrade(session, enrolled, meta), recoveryCodes: codes }
      })
    },

    /** Second step of sign-in for enrolled members: TOTP or a recovery code. */
    async verifyMfa(token: string | undefined, code: string, meta: RequestMeta) {
      const live = await liveSession(token)
      if (!live) throw new DomainError("unauthorized", "Your sign-in expired. Please sign in again.")
      await limit(`admin-mfa:${live.session.id}`, 5, 300)
      return atomic(async () => {
        const current = await liveSession(token)
        if (!current) throw new DomainError("unauthorized", "Your sign-in expired. Please sign in again.")
        if (current.session.aal === 2) return { token: token as string, expiresAt: current.session.expiresAt, aal: 2 as const, needs: null }
        if (!(await checkSecondFactor(current.member, code))) throw new DomainError("validation", BAD_CODE)
        return upgrade(current.session, current.member, meta)
      })
    },

    /** Re-proves the second factor on an AAL2 session for sensitive actions (A-003). */
    async stepUp(staff: StaffContext, code: string, meta: RequestMeta) {
      await limit(`admin-mfa:${staff.session.id}`, 5, 300)
      return atomic(async () => {
      const member = await repo.findMember(staff.member.storeId, staff.member.userId)
      if (!member || !(await checkSecondFactor(member, code))) throw new DomainError("validation", BAD_CODE)
      await repo.updateSession(staff.session.id, { mfaAt: iso() })
      await recordAudit(staff, meta, { action: "staff.stepped_up", entity: "staff", entityId: member.userId, storeId: member.storeId })
      })
    },

    async regenerateRecoveryCodes(staff: StaffContext, meta: RequestMeta) {
      assertSteppedUp(staff)
      return atomic(async () => {
      const codes = newRecoveryCodes()
      await repo.updateMember(staff.member.storeId, staff.member.userId, { recoveryCodes: codes.map((entry) => hashToken(entry)) })
      await recordAudit(staff, meta, { action: "staff.recovery_codes_regenerated", entity: "staff", entityId: staff.member.userId, storeId: staff.member.storeId })
      return codes
      })
    },

    async changePassword(staff: StaffContext, current: string, next: string, meta: RequestMeta) {
      return atomic(async () => {
      const member = await repo.findMember(staff.member.storeId, staff.member.userId)
      if (!member?.passwordHash || !(await verifyPassword(current, member.passwordHash))) throw new DomainError("validation", "Your current password isn't right.")
      const problem = passwordProblem(next, member.email)
      if (problem) throw new DomainError("validation", problem, { fields: { password: [problem] } })
      assertPasswordPolicy(next, 12)
      await repo.updateMember(member.storeId, member.userId, { passwordHash: await hashPassword(next) })
      await repo.revokeSessions(member.storeId, member.userId)
      await recordAudit(staff, meta, { action: "staff.password_changed", entity: "staff", entityId: member.userId, storeId: member.storeId })
      await deps.notifySecurity?.(member.email, "password_changed")
      return issueSession(member, 2, meta, staff.session.mfaAt ?? undefined)
      })
    },

    // ─── Sessions ──────────────────────────────────────────────────────────
    async listSessions(staff: StaffContext, userId = staff.member.userId) {
      if (userId !== staff.member.userId) requireIn(staff, "staff:read")
      const at = clock()
      return (await repo.listSessions(staff.member.storeId, userId))
        .filter((session) => !session.revokedAt && Date.parse(session.expiresAt) > at && Date.parse(session.lastSeenAt) + minutes(SESSION_IDLE_MINUTES) > at)
        .map((session) => ({ id: session.id, aal: session.aal, ip: session.ip, userAgent: session.userAgent, createdAt: session.createdAt, lastSeenAt: session.lastSeenAt, current: session.id === staff.session.id }))
    },

    async revokeSession(staff: StaffContext, sessionId: string, meta: RequestMeta) {
      const own = await repo.listSessions(staff.member.storeId, staff.member.userId)
      if (!own.some((session) => session.id === sessionId)) {
        requireIn(staff, "staff:manage")
        assertSteppedUp(staff)
      }
      await repo.updateSession(sessionId, { revokedAt: iso() })
      await recordAudit(staff, meta, { action: "staff.session_revoked", entity: "staff_session", entityId: sessionId, storeId: staff.member.storeId })
    },

    async signOutEverywhere(staff: StaffContext, meta: RequestMeta) {
      await repo.revokeSessions(staff.member.storeId, staff.member.userId)
      await recordAudit(staff, meta, { action: "staff.signed_out_everywhere", entity: "staff", entityId: staff.member.userId, storeId: staff.member.storeId })
    },

    // ─── Invites ───────────────────────────────────────────────────────────
    async invite(staff: StaffContext, input: { email: string; roleKey: string }, meta: RequestMeta) {
      requireIn(staff, "staff:manage")
      assertSteppedUp(staff)
      const storeId = staff.member.storeId
      const email = input.email.trim().toLowerCase()
      const role = await repo.findRole(storeId, input.roleKey)
      if (!role) throw new DomainError("validation", "Choose a role.")
      assertCanGrant(staff, role.permissions, [role.key])
      if (await repo.findMemberByEmail(storeId, email)) throw new DomainError("conflict", "Someone with this email is already on the team.")
      const token = newToken()
      const invite = await repo.createInvite({ id: newId(), storeId, email, roleKey: role.key, tokenHash: hashToken(token), invitedBy: staff.member.userId, expiresAt: iso(clock() + INVITE_HOURS * 3_600_000), acceptedAt: null, revokedAt: null, createdAt: iso() })
      await recordAudit(staff, meta, { action: "staff.invited", entity: "staff_invite", entityId: invite.id, after: { email, role: role.key }, storeId })
      // No email provider sends invites yet (EMAIL_PROVIDER=console): the admin shows the link once.
      return { inviteId: invite.id, path: `/admin/invite/${token}`, expiresAt: invite.expiresAt }
    },

    async listInvites(staff: StaffContext) {
      requireIn(staff, "staff:read")
      const at = clock()
      return (await repo.listInvites(staff.member.storeId)).map((invite) => ({
        id: invite.id,
        email: invite.email,
        roleKey: invite.roleKey,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        state: invite.acceptedAt ? ("accepted" as const) : invite.revokedAt ? ("revoked" as const) : Date.parse(invite.expiresAt) <= at ? ("expired" as const) : ("pending" as const),
      }))
    },

    async revokeInvite(staff: StaffContext, inviteId: string, meta: RequestMeta) {
      requireIn(staff, "staff:manage")
      await repo.updateInvite(inviteId, { revokedAt: iso() })
      await recordAudit(staff, meta, { action: "staff.invite_revoked", entity: "staff_invite", entityId: inviteId, storeId: staff.member.storeId })
    },

    /** What the invite page shows before the person sets a password. */
    async peekInvite(token: string) {
      const invite = await repo.findInviteByTokenHash(hashToken(token))
      if (!invite || invite.acceptedAt || invite.revokedAt || Date.parse(invite.expiresAt) <= clock()) return null
      const role = await repo.findRole(invite.storeId, invite.roleKey)
      return { email: invite.email, roleName: role?.name ?? invite.roleKey }
    },

    /** Creates the account from an invite; the person then enrols MFA before anything else. */
    async acceptInvite(token: string, input: { displayName: string; password: string }, meta: RequestMeta): Promise<IssuedSession> {
      await limit(`admin-invite:${meta.ip ?? "unknown"}`, 10, 300)
      return atomic(async () => {
      const invite = await repo.findInviteByTokenHash(hashToken(token))
      if (!invite || invite.acceptedAt || invite.revokedAt || Date.parse(invite.expiresAt) <= clock()) throw new DomainError("not_found", "This invite link has expired or was already used. Ask for a new one.")
      await ensureRegistry(invite.storeId)
      const problem = passwordProblem(input.password, invite.email)
      if (problem) throw new DomainError("validation", problem, { fields: { password: [problem] } })
      assertPasswordPolicy(input.password, 12)
      if (await repo.findMemberByEmail(invite.storeId, invite.email)) throw new DomainError("conflict", "This invite was already used.")
      const at = iso()
      const member = await repo.createMember({
        userId: newId(),
        storeId: invite.storeId,
        email: invite.email,
        displayName: input.displayName.trim().slice(0, 80),
        status: "active",
        passwordHash: await hashPassword(input.password),
        totpSecret: null,
        totpEnabledAt: null,
        totpLastStep: null,
        recoveryCodes: [],
        failedLogins: 0,
        lockedUntil: null,
        lastSeenAt: null,
        createdAt: at,
        updatedAt: at,
      })
      await repo.setRoles(invite.storeId, member.userId, [invite.roleKey])
      await repo.updateInvite(invite.id, { acceptedAt: at })
      await recordAudit(null, meta, { action: "staff.invite_accepted", entity: "staff", entityId: member.userId, after: { email: member.email, role: invite.roleKey }, storeId: invite.storeId, actorId: member.userId })
      return issueSession(member, 1, meta)
      })
    },

    // ─── Staff ─────────────────────────────────────────────────────────────
    async listStaff(staff: StaffContext): Promise<StaffSummary[]> {
      requireIn(staff, "staff:read")
      const members = await repo.listMembers(staff.member.storeId)
      return Promise.all(members.map(async (member) => toSummary(member, await repo.rolesOf(member.storeId, member.userId))))
    },

    async getStaff(staff: StaffContext, userId: string) {
      requireIn(staff, "staff:read")
      const { member, roles } = await memberAndRoles(staff.member.storeId, userId)
      return { ...toSummary(member, roles), updatedAt: member.updatedAt, lockedUntil: member.lockedUntil, locked: member.lockedUntil !== null && Date.parse(member.lockedUntil) > clock() }
    },

    async setStaffRoles(staff: StaffContext, userId: string, roleKeys: string[], meta: RequestMeta, reason: string | null) {
      requireIn(staff, "staff:manage")
      assertSteppedUp(staff)
      const storeId = staff.member.storeId
      const { roles: before } = await memberAndRoles(storeId, userId)
      if (roleKeys.length === 0) throw new DomainError("validation", "Give them at least one role.")
      const roles = await Promise.all(roleKeys.map((key) => repo.findRole(storeId, key)))
      if (roles.some((role) => !role)) throw new DomainError("validation", "Unknown role.")
      const added = roles.filter((role): role is Role => !before.some((entry) => entry.key === role?.key))
      assertCanGrant(staff, added.flatMap((role) => role.permissions), added.map((role) => role.key))
      if (before.some((role) => role.key === OWNER_ROLE_KEY) && !roleKeys.includes(OWNER_ROLE_KEY)) assertCanGrant(staff, [], [OWNER_ROLE_KEY])
      await repo.setRoles(storeId, userId, roleKeys)
      // Permissions changed: their open sessions end so the next request re-reads them (A-004).
      if (userId !== staff.member.userId) await repo.revokeSessions(storeId, userId)
      await recordAudit(staff, meta, { action: "staff.roles_changed", entity: "staff", entityId: userId, before: before.map((role) => role.key), after: roleKeys, reason, storeId })
    },

    async setStaffStatus(staff: StaffContext, userId: string, status: "active" | "suspended", meta: RequestMeta, reason: string | null) {
      requireIn(staff, "staff:manage")
      assertSteppedUp(staff)
      if (userId === staff.member.userId) throw new DomainError("conflict", "You can't suspend yourself.")
      const storeId = staff.member.storeId
      const { member, roles } = await memberAndRoles(storeId, userId)
      if (roles.some((role) => role.key === OWNER_ROLE_KEY)) assertCanGrant(staff, [], [OWNER_ROLE_KEY])
      await repo.updateMember(storeId, userId, { status, ...(status === "active" ? { failedLogins: 0, lockedUntil: null } : {}) })
      if (status === "suspended") await repo.revokeSessions(storeId, userId)
      await recordAudit(staff, meta, { action: status === "suspended" ? "staff.suspended" : "staff.reactivated", entity: "staff", entityId: userId, before: { status: member.status }, after: { status }, reason, storeId })
    },

    /** Clears someone's MFA (lost phone); they enrol again at next sign-in. */
    async resetMfa(staff: StaffContext, userId: string, meta: RequestMeta, reason: string | null) {
      requireIn(staff, "staff:manage")
      assertSteppedUp(staff)
      const storeId = staff.member.storeId
      const { roles } = await memberAndRoles(storeId, userId)
      if (roles.some((role) => role.key === OWNER_ROLE_KEY)) assertCanGrant(staff, [], [OWNER_ROLE_KEY])
      await repo.updateMember(storeId, userId, { totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [] })
      await repo.revokeSessions(storeId, userId)
      await recordAudit(staff, meta, { action: "staff.mfa_reset", entity: "staff", entityId: userId, reason, storeId })
    },

    // ─── Roles ─────────────────────────────────────────────────────────────
    async listRoles(staff: StaffContext) {
      requireIn(staff, "staff:read")
      const roles = await repo.listRoles(staff.member.storeId)
      const members = await repo.listMembers(staff.member.storeId)
      const holders = new Map<string, number>()
      for (const member of members) for (const role of await repo.rolesOf(member.storeId, member.userId)) holders.set(role.key, (holders.get(role.key) ?? 0) + 1)
      return roles.map((role) => ({ ...role, members: holders.get(role.key) ?? 0 }))
    },

    async saveRole(
      staff: StaffContext,
      input: { key?: string; name: string; description: string; refundLimit: number | null; permissions: string[] },
      meta: RequestMeta,
      expectedUpdatedAt?: string,
    ) {
      requireIn(staff, "roles:manage")
      assertSteppedUp(staff)
      const storeId = staff.member.storeId
      const permissions = input.permissions.filter(isPermission)
      if (permissions.length !== input.permissions.length) throw new DomainError("validation", "Unknown permission.")
      assertCanGrant(staff, permissions)
      if (input.key) {
        const before = await repo.findRole(storeId, input.key)
        if (!before) throw new DomainError("not_found", "Role not found.")
        if (before.key === OWNER_ROLE_KEY) throw new DomainError("forbidden", "The Owner role cannot be changed.")
        const after = await repo.updateRole(storeId, input.key, { name: input.name, description: input.description, refundLimit: input.refundLimit, permissions }, expectedUpdatedAt)
        await recordAudit(staff, meta, { action: "role.updated", entity: "role", entityId: after.key, before: { name: before.name, refundLimit: before.refundLimit, permissions: before.permissions }, after: { name: after.name, refundLimit: after.refundLimit, permissions: after.permissions }, storeId })
        await Promise.all((await repo.listMembers(storeId)).map(async (member) => ((await repo.rolesOf(storeId, member.userId)).some((role) => role.key === after.key) && member.userId !== staff.member.userId ? repo.revokeSessions(storeId, member.userId) : undefined)))
        return after
      }
      const base = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || "role"
      const existing = new Set((await repo.listRoles(storeId)).map((role) => role.key))
      let key = base.length < 2 ? `${base}_role` : base
      for (let n = 2; existing.has(key); n++) key = `${base}_${n}`
      const at = iso()
      const created = await repo.createRole({ id: newId(), storeId, key, name: input.name.trim(), description: input.description.trim(), isSystem: false, refundLimit: input.refundLimit, permissions, createdAt: at, updatedAt: at })
      await recordAudit(staff, meta, { action: "role.created", entity: "role", entityId: created.key, after: { name: created.name, refundLimit: created.refundLimit, permissions: created.permissions }, storeId })
      return created
    },

    async deleteRole(staff: StaffContext, key: string, meta: RequestMeta) {
      requireIn(staff, "roles:manage")
      assertSteppedUp(staff)
      const role = await repo.findRole(staff.member.storeId, key)
      if (!role) throw new DomainError("not_found", "Role not found.")
      if (role.isSystem) throw new DomainError("forbidden", "System roles cannot be deleted.")
      await repo.deleteRole(staff.member.storeId, key)
      await recordAudit(staff, meta, { action: "role.deleted", entity: "role", entityId: key, before: { name: role.name, permissions: role.permissions }, storeId: staff.member.storeId })
    },
  }
}

export type AdminService = ReturnType<typeof createAdminService>
