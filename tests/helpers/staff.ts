import { ALL_PERMISSIONS, PRESET_ROLES } from "@/server/admin/permissions"
import { hashToken, newToken } from "@/server/admin/crypto"
import { resolvePermissions } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import { uuidv7 } from "@/server/db/uuid"
import { STORE_ID } from "@/server/fixtures/seed"
import { db } from "@/server/fixtures/store"

/** Real fixture identity/session/role rows keep service tests valid behind the new raw policy. */
export function fixtureStaff(roleKey: string, steppedUp = true): StaffContext {
  const preset = PRESET_ROLES.find((role) => role.key === roleKey)
  if (!preset) throw new Error("Unknown fixture staff role")
  const tables = db(), role = tables.adminRoles.find((row) => row.key === roleKey && row.storeId === STORE_ID)
  if (!role || preset.permissions.some((permission) => !ALL_PERMISSIONS.includes(permission))) throw new Error("Fixture staff registry is missing")
  const email = roleKey + "@example.com", now = new Date().toISOString()
  let member = tables.staffMembers.find((row) => row.storeId === STORE_ID && row.email === email)
  if (!member) {
    member = { userId: uuidv7(), storeId: STORE_ID, email, displayName: preset.name, status: "active", passwordHash: null, totpSecret: "fixture-only-enrolled-factor", totpEnabledAt: now, totpLastStep: null, recoveryCodes: [], failedLogins: 0, lockedUntil: null, lastSeenAt: now, createdAt: now, updatedAt: now }
    tables.staffMembers.push(member)
    tables.staffRoleLinks.push({ userId: member.userId, storeId: STORE_ID, roleId: role.id })
  }
  const mfaAt = steppedUp ? now : new Date(Date.now() - 660_000).toISOString(), expiresAt = new Date(Date.now() + 43_200_000).toISOString()
  const session = { id: uuidv7(), userId: member.userId, storeId: STORE_ID, tokenHash: hashToken(newToken()), aal: 2 as const, mfaAt, ip: "203.0.113.9", userAgent: "vitest", createdAt: now, lastSeenAt: now, expiresAt, revokedAt: null }
  tables.staffSessions.push(session)
  const { permissions, refundLimit } = resolvePermissions([role])
  return { member: { userId: member.userId, storeId: STORE_ID, email, displayName: preset.name, status: "active", totpEnabledAt: member.totpEnabledAt }, session: { id: session.id, aal: 2, mfaAt, createdAt: now, expiresAt }, roles: [{ id: role.id, key: roleKey, name: preset.name, refundLimit: role.refundLimit }], permissions, refundLimit }
}
