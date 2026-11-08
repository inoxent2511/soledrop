import "server-only"

import { isPermission, type Permission } from "@/server/admin/permissions"
import type { AdminOperations } from "@/server/admin/repository"
import type { Role, StaffInvite, StaffMember, StaffSession } from "@/server/admin/types"
import { supabase, unwrap } from "@/server/db/supabase"
import { DomainError } from "@/server/shared/errors"

/** Staff identity and RBAC on Postgres (migration 20261107090000_admin_foundation.sql). */

type MemberRow = {
  user_id: string
  store_id: string
  email: string
  display_name: string
  status: StaffMember["status"]
  password_hash: string | null
  totp_secret: string | null
  totp_enabled_at: string | null
  totp_last_step: number | string | null
  recovery_codes: string[]
  failed_logins: number
  locked_until: string | null
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

const MEMBER_COLUMNS =
  "user_id, store_id, email, display_name, status, password_hash, totp_secret, totp_enabled_at, totp_last_step, recovery_codes, failed_logins, locked_until, last_seen_at, created_at, updated_at"

const toMember = (row: MemberRow): StaffMember => ({
  userId: row.user_id,
  storeId: row.store_id,
  email: row.email,
  displayName: row.display_name,
  status: row.status,
  passwordHash: row.password_hash,
  totpSecret: row.totp_secret,
  totpEnabledAt: row.totp_enabled_at,
  totpLastStep: row.totp_last_step === null ? null : Number(row.totp_last_step),
  recoveryCodes: row.recovery_codes ?? [],
  failedLogins: row.failed_logins,
  lockedUntil: row.locked_until,
  lastSeenAt: row.last_seen_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const memberColumns = (changes: Partial<StaffMember>): Record<string, unknown> => {
  const map: Record<string, unknown> = {}
  if (changes.email !== undefined) map.email = changes.email
  if (changes.displayName !== undefined) map.display_name = changes.displayName
  if (changes.status !== undefined) map.status = changes.status
  if (changes.passwordHash !== undefined) map.password_hash = changes.passwordHash
  if (changes.totpSecret !== undefined) map.totp_secret = changes.totpSecret
  if (changes.totpEnabledAt !== undefined) map.totp_enabled_at = changes.totpEnabledAt
  if (changes.totpLastStep !== undefined) map.totp_last_step = changes.totpLastStep
  if (changes.recoveryCodes !== undefined) map.recovery_codes = changes.recoveryCodes
  if (changes.failedLogins !== undefined) map.failed_logins = changes.failedLogins
  if (changes.lockedUntil !== undefined) map.locked_until = changes.lockedUntil
  if (changes.lastSeenAt !== undefined) map.last_seen_at = changes.lastSeenAt
  return map
}

type RoleRow = {
  id: string
  store_id: string
  key: string
  name: string
  description: string
  is_system: boolean
  refund_limit: number | string | null
  created_at: string
  updated_at: string
  role_permissions: { permission: string }[]
}

const ROLE_COLUMNS = "id, store_id, key, name, description, is_system, refund_limit, created_at, updated_at, role_permissions(permission)"

const toRole = (row: RoleRow): Role => ({
  id: row.id,
  storeId: row.store_id,
  key: row.key,
  name: row.name,
  description: row.description,
  isSystem: row.is_system,
  refundLimit: row.refund_limit === null ? null : Number(row.refund_limit),
  permissions: row.role_permissions.map((entry) => entry.permission).filter(isPermission),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

type InviteRow = {
  id: string
  store_id: string
  email: string
  role_key: string
  token_hash: string
  invited_by: string | null
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  created_at: string
}

const toInvite = (row: InviteRow): StaffInvite => ({
  id: row.id,
  storeId: row.store_id,
  email: row.email,
  roleKey: row.role_key,
  tokenHash: row.token_hash,
  invitedBy: row.invited_by,
  expiresAt: row.expires_at,
  acceptedAt: row.accepted_at,
  revokedAt: row.revoked_at,
  createdAt: row.created_at,
})

type SessionRow = {
  id: string
  user_id: string
  store_id: string
  token_hash: string
  aal: 1 | 2
  mfa_at: string | null
  ip: string | null
  user_agent: string | null
  created_at: string
  last_seen_at: string
  expires_at: string
  revoked_at: string | null
}

const toSession = (row: SessionRow): StaffSession => ({
  id: row.id,
  userId: row.user_id,
  storeId: row.store_id,
  tokenHash: row.token_hash,
  aal: row.aal,
  mfaAt: row.mfa_at,
  ip: row.ip,
  userAgent: row.user_agent,
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
})

const sessionColumns = (changes: Partial<StaffSession>): Record<string, unknown> => {
  const map: Record<string, unknown> = {}
  if (changes.aal !== undefined) map.aal = changes.aal
  if (changes.mfaAt !== undefined) map.mfa_at = changes.mfaAt
  if (changes.lastSeenAt !== undefined) map.last_seen_at = changes.lastSeenAt
  if (changes.expiresAt !== undefined) map.expires_at = changes.expiresAt
  if (changes.revokedAt !== undefined) map.revoked_at = changes.revokedAt
  return map
}

export function createSupabaseAdminRepository(): AdminOperations {
  return {
    async findMemberByEmail(storeId, email) {
      const row = unwrap(await supabase().from("staff_members").select(MEMBER_COLUMNS).eq("store_id", storeId).ilike("email", email).maybeSingle()) as MemberRow | null
      return row ? toMember(row) : null
    },
    async findMember(storeId, userId) {
      const row = unwrap(await supabase().from("staff_members").select(MEMBER_COLUMNS).eq("store_id", storeId).eq("user_id", userId).maybeSingle()) as MemberRow | null
      return row ? toMember(row) : null
    },
    async listMembers(storeId) {
      const rows = unwrap(await supabase().from("staff_members").select(MEMBER_COLUMNS).eq("store_id", storeId).order("created_at")) as MemberRow[]
      return rows.map(toMember)
    },
    async createMember(member) {
      const row = unwrap(
        await supabase()
          .from("staff_members")
          .insert({ user_id: member.userId, store_id: member.storeId, created_at: member.createdAt, ...memberColumns(member) })
          .select(MEMBER_COLUMNS)
          .single(),
      ) as MemberRow
      return toMember(row)
    },
    async updateMember(storeId, userId, changes, expectedUpdatedAt) {
      let query = supabase().from("staff_members").update(memberColumns(changes)).eq("store_id", storeId).eq("user_id", userId)
      if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt)
      const row = unwrap(await query.select(MEMBER_COLUMNS).maybeSingle()) as MemberRow | null
      if (!row) throw new DomainError(expectedUpdatedAt ? "conflict" : "not_found", expectedUpdatedAt ? "Someone else changed this staff member. Reload to see their changes." : "Staff member not found.")
      return toMember(row)
    },

    async syncRegistry(storeId, permissions, presets) {
      unwrap(
        await supabase().rpc("sync_admin_registry", {
          p_store_id: storeId,
          p_permissions: permissions,
          p_roles: presets.map((preset) => ({ key: preset.key, name: preset.name, description: preset.description, refund_limit: preset.refundLimit, permissions: preset.permissions })),
        }),
      )
    },
    async listRoles(storeId) {
      const rows = unwrap(await supabase().from("roles").select(ROLE_COLUMNS).eq("store_id", storeId).order("created_at")) as RoleRow[]
      return rows.map(toRole)
    },
    async findRole(storeId, key) {
      const row = unwrap(await supabase().from("roles").select(ROLE_COLUMNS).eq("store_id", storeId).eq("key", key).maybeSingle()) as RoleRow | null
      return row ? toRole(row) : null
    },
    async createRole(role) {
      unwrap(
        await supabase().rpc("save_role", {
          p_store_id: role.storeId,
          p_key: role.key,
          p_name: role.name,
          p_description: role.description,
          p_refund_limit: role.refundLimit,
          p_permissions: role.permissions,
          p_expected_updated_at: null,
          p_create: true,
        }),
      )
      return (await this.findRole(role.storeId, role.key)) as Role
    },
    async updateRole(storeId, key, changes, expectedUpdatedAt) {
      const current = await this.findRole(storeId, key)
      if (!current) throw new DomainError("not_found", "Role not found.")
      unwrap(
        await supabase().rpc("save_role", {
          p_store_id: storeId,
          p_key: key,
          p_name: changes.name ?? current.name,
          p_description: changes.description ?? current.description,
          p_refund_limit: changes.refundLimit === undefined ? current.refundLimit : changes.refundLimit,
          p_permissions: (changes.permissions ?? current.permissions) satisfies Permission[],
          p_expected_updated_at: expectedUpdatedAt ?? null,
          p_create: false,
        }),
      )
      return (await this.findRole(storeId, key)) as Role
    },
    async deleteRole(storeId, key) {
      unwrap(await supabase().rpc("delete_role", { p_store_id: storeId, p_key: key }))
    },

    async rolesOf(storeId, userId) {
      const rows = unwrap(await supabase().from("staff_roles").select(`roles(${ROLE_COLUMNS})`).eq("store_id", storeId).eq("user_id", userId)) as unknown as { roles: RoleRow }[]
      return rows.map((row) => toRole(row.roles))
    },
    async setRoles(storeId, userId, roleKeys) {
      unwrap(await supabase().rpc("set_staff_roles", { p_store_id: storeId, p_user_id: userId, p_role_keys: roleKeys }))
    },
    async countActiveOwners(storeId) {
      return unwrap(await supabase().rpc("active_owner_count", { p_store_id: storeId })) as number
    },

    async createInvite(invite) {
      const row = unwrap(
        await supabase()
          .from("staff_invites")
          .insert({
            id: invite.id,
            store_id: invite.storeId,
            email: invite.email,
            role_key: invite.roleKey,
            token_hash: invite.tokenHash,
            invited_by: invite.invitedBy,
            expires_at: invite.expiresAt,
            created_at: invite.createdAt,
          })
          .select("*")
          .single(),
      ) as InviteRow
      return toInvite(row)
    },
    async findInviteByTokenHash(tokenHash) {
      const row = unwrap(await supabase().from("staff_invites").select("*").eq("token_hash", tokenHash).maybeSingle()) as InviteRow | null
      return row ? toInvite(row) : null
    },
    async updateInvite(id, changes) {
      const map: Record<string, unknown> = {}
      if (changes.acceptedAt !== undefined) map.accepted_at = changes.acceptedAt
      if (changes.revokedAt !== undefined) map.revoked_at = changes.revokedAt
      if (changes.expiresAt !== undefined) map.expires_at = changes.expiresAt
      if (changes.tokenHash !== undefined) map.token_hash = changes.tokenHash
      unwrap(await supabase().from("staff_invites").update(map).eq("id", id))
    },
    async listInvites(storeId) {
      const rows = unwrap(await supabase().from("staff_invites").select("*").eq("store_id", storeId).order("created_at", { ascending: false })) as InviteRow[]
      return rows.map(toInvite)
    },

    async createSession(session) {
      unwrap(
        await supabase().from("staff_sessions").insert({
          id: session.id,
          user_id: session.userId,
          store_id: session.storeId,
          token_hash: session.tokenHash,
          aal: session.aal,
          mfa_at: session.mfaAt,
          ip: session.ip,
          user_agent: session.userAgent,
          created_at: session.createdAt,
          last_seen_at: session.lastSeenAt,
          expires_at: session.expiresAt,
        }),
      )
    },
    async findSessionByTokenHash(tokenHash) {
      const row = unwrap(await supabase().from("staff_sessions").select("*").eq("token_hash", tokenHash).maybeSingle()) as SessionRow | null
      return row ? toSession(row) : null
    },
    async updateSession(id, changes) {
      unwrap(await supabase().from("staff_sessions").update(sessionColumns(changes)).eq("id", id))
    },
    async listSessions(storeId, userId) {
      const rows = unwrap(await supabase().from("staff_sessions").select("*").eq("store_id", storeId).eq("user_id", userId).order("last_seen_at", { ascending: false })) as SessionRow[]
      return rows.map(toSession)
    },
    async revokeSessions(storeId, userId, keepSessionId) {
      let query = supabase().from("staff_sessions").update({ revoked_at: new Date().toISOString() }).eq("store_id", storeId).eq("user_id", userId).is("revoked_at", null)
      if (keepSessionId) query = query.neq("id", keepSessionId)
      unwrap(await query)
    },
  }
}
