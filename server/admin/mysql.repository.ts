import "server-only"

import { and, asc, eq, getTableColumns, inArray, isNull, ne } from "drizzle-orm"
import { isPermission, OWNER_ROLE_KEY, type Permission } from "./permissions"
import type { AdminRepository } from "./repository"
import type { Role, StaffInvite, StaffMember, StaffSession } from "./types"
import { type Actor, type ActorScoped, requireFreshGrant, requireGrant, requireStore, requireSystem } from "@/server/db/actor"
import { database, type Database, withTransaction } from "@/server/db/client"
import { constant } from "@/server/db/query.repository"
import { permissions, rolePermissions, roles, staffInvites, staffMembers, staffRecoveryCodes, staffRoles, staffSessions, stores } from "@/server/db/schema"
import { isoDate, nullableIsoDate, nullableSqlDate, sqlDate, sqlNow } from "@/server/db/values"
import { uuidv7 } from "@/server/db/uuid"
import { DomainError } from "@/server/shared/errors"

const auth = (actor: Actor) => actor.kind === "system" && ["auth:staff", "bootstrap", "migration"].includes(actor.purpose)
function readMember(actor: Actor, storeId: string, userId?: string) {
  requireStore(actor, storeId)
  if (auth(actor) || actor.kind === "staff" && actor.id === userId) return
  requireGrant(actor, "staff:read")
}
function manage(actor: Actor, permission: "staff:manage" | "roles:manage" = "staff:manage") {
  if (auth(actor)) return
  requireFreshGrant(actor, permission)
}
function memberProjection(actor: Actor, own = false) {
  const secrets = auth(actor) || own
  return { ...getTableColumns(staffMembers), passwordHash: secrets ? staffMembers.passwordHash : constant(null), totpSecret: secrets ? staffMembers.totpSecret : constant(null) }
}
async function member(db: Database, actor: Actor, row: typeof staffMembers.$inferSelect): Promise<StaffMember> {
  const codes = auth(actor) || actor.kind === "staff" && actor.id === row.userId
    ? await db.select({ value: staffRecoveryCodes.value }).from(staffRecoveryCodes).where(and(eq(staffRecoveryCodes.storeId, actor.storeId), eq(staffRecoveryCodes.userId, row.userId))).orderBy(asc(staffRecoveryCodes.position)) : []
  return { userId: row.userId, storeId: row.storeId, email: row.email ?? "", displayName: row.displayName, status: row.status as StaffMember["status"], passwordHash: row.passwordHash, totpSecret: row.totpSecret, totpEnabledAt: nullableIsoDate(row.totpEnabledAt), totpLastStep: row.totpLastStep, recoveryCodes: codes.map((code) => code.value), failedLogins: row.failedLogins, lockedUntil: nullableIsoDate(row.lockedUntil), lastSeenAt: nullableIsoDate(row.lastSeenAt), createdAt: isoDate(row.createdAt), updatedAt: isoDate(row.updatedAt) }
}
async function roleRows(db: Database, actor: Actor, rows: (typeof roles.$inferSelect)[]): Promise<Role[]> {
  if (!rows.length) return []
  const links = await db.select().from(rolePermissions).where(inArray(rolePermissions.roleId, rows.map((row) => row.id)))
  return rows.filter((row) => row.storeId === actor.storeId).map((row) => ({ ...row, isSystem: row.isSystem === 1, createdAt: isoDate(row.createdAt), updatedAt: isoDate(row.updatedAt), permissions: links.filter((link) => link.roleId === row.id).map((link) => link.permission).filter(isPermission) }))
}
async function ownerCount(db: Database, storeId: string): Promise<number> {
  const rows = await db.select({ id: staffMembers.userId }).from(staffMembers).innerJoin(staffRoles, and(eq(staffRoles.userId, staffMembers.userId), eq(staffRoles.storeId, staffMembers.storeId))).innerJoin(roles, eq(roles.id, staffRoles.roleId)).where(and(eq(staffMembers.storeId, storeId), eq(roles.storeId, storeId), eq(staffMembers.status, "active"), eq(roles.key, OWNER_ROLE_KEY))).orderBy(asc(staffMembers.userId)).for("update")
  return rows.length
}
async function storeLock(db: Database, actor: Actor) {
  const [row] = await db.select({ id: stores.id }).from(stores).where(eq(stores.id, actor.storeId)).for("update")
  if (!row) throw new DomainError("not_found", "Store not found.")
}
async function keepsOwner(db: Database, actor: Actor, change: () => Promise<void>) {
  await storeLock(db, actor)
  const before = await ownerCount(db, actor.storeId)
  await change()
  if (before > 0 && await ownerCount(db, actor.storeId) === 0) throw new DomainError("conflict", "The store must keep at least one active Owner.")
}
function canGrant(actor: Actor, granted: readonly Permission[], keys: readonly string[] = []) {
  if (auth(actor)) return
  if (actor.kind !== "staff" || granted.some((permission) => !actor.permissions.includes(permission)) || keys.includes(OWNER_ROLE_KEY) && !actor.roleKeys.includes(OWNER_ROLE_KEY)) throw new DomainError("forbidden", "You can't grant permissions you don't have yourself.")
}
async function replacePermissions(db: Database, roleId: string, granted: readonly Permission[]) {
  if (granted.some((permission) => !isPermission(permission))) throw new DomainError("validation", "Unknown permission.")
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId))
  if (granted.length) await db.insert(rolePermissions).values([...new Set(granted)].map((permission) => ({ roleId, permission })))
}
function invite(row: typeof staffInvites.$inferSelect): StaffInvite { return { ...row, createdAt: isoDate(row.createdAt), expiresAt: isoDate(row.expiresAt), acceptedAt: nullableIsoDate(row.acceptedAt), revokedAt: nullableIsoDate(row.revokedAt) } }
function session(row: typeof staffSessions.$inferSelect): StaffSession { return { ...row, aal: row.aal as 1 | 2, mfaAt: nullableIsoDate(row.mfaAt), createdAt: isoDate(row.createdAt), lastSeenAt: isoDate(row.lastSeenAt), expiresAt: isoDate(row.expiresAt), revokedAt: nullableIsoDate(row.revokedAt) } }

export function createMysqlAdminRepository(): ActorScoped<AdminRepository> {
  return {
    async findMemberByEmail(actor, storeId, email) {
      requireStore(actor, storeId); requireSystem(actor, ["auth:staff", "bootstrap", "migration"])
      const db = await database()
      const [row] = await db.select(memberProjection(actor)).from(staffMembers).where(and(eq(staffMembers.storeId, actor.storeId), eq(staffMembers.email, email.trim().toLowerCase()))).limit(1)
      return row ? member(db, actor, row) : null
    },
    async findMember(actor, storeId, userId) {
      readMember(actor, storeId, userId)
      const db = await database()
      const [row] = await db.select(memberProjection(actor, actor.kind === "staff" && actor.id === userId)).from(staffMembers).where(and(eq(staffMembers.storeId, actor.storeId), eq(staffMembers.userId, userId))).limit(1)
      return row ? member(db, actor, row) : null
    },
    async listMembers(actor, storeId) {
      readMember(actor, storeId)
      const db = await database()
      const rows = await db.select(memberProjection(actor)).from(staffMembers).where(eq(staffMembers.storeId, actor.storeId)).orderBy(asc(staffMembers.createdAt), staffMembers.userId)
      return Promise.all(rows.map((row) => member(db, actor, row)))
    },
    async createMember(actor, input) {
      requireStore(actor, input.storeId); manage(actor)
      return withTransaction(async (db) => {
        await storeLock(db, actor)
        const { recoveryCodes, ...rest } = input
        await db.insert(staffMembers).values({ ...rest, email: input.email.trim().toLowerCase(), createdAt: sqlDate(input.createdAt), updatedAt: sqlDate(input.updatedAt), totpEnabledAt: nullableSqlDate(input.totpEnabledAt), lockedUntil: nullableSqlDate(input.lockedUntil), lastSeenAt: nullableSqlDate(input.lastSeenAt) })
        if (recoveryCodes.length) await db.insert(staffRecoveryCodes).values(recoveryCodes.map((value, position) => ({ userId: input.userId, storeId: actor.storeId, value, position })))
        return structuredClone(input)
      })
    },
    async updateMember(actor, storeId, userId, changes, expectedUpdatedAt) {
      requireStore(actor, storeId)
      const own = actor.kind === "staff" && actor.id === userId
      if (!own || changes.status !== undefined) manage(actor)
      else if (actor.kind !== "staff" || !actor.mfaVerifiedAt) throw new DomainError("unauthorized", "Finish two-step verification first.")
      if (changes.userId !== undefined || changes.storeId !== undefined) throw new DomainError("validation", "Identity keys cannot be changed.")
      return withTransaction(async (db) => {
        let saved: StaffMember | undefined
        await keepsOwner(db, actor, async () => {
          const where = and(eq(staffMembers.storeId, actor.storeId), eq(staffMembers.userId, userId))
          const [row] = await db.select().from(staffMembers).where(where).for("update")
          if (!row) throw new DomainError("not_found", "Staff member not found.")
          if (expectedUpdatedAt && isoDate(row.updatedAt) !== expectedUpdatedAt) throw new DomainError("conflict", "Someone else changed this staff member. Reload to see their changes.")
          if (changes.totpLastStep !== undefined && changes.totpLastStep !== null && row.totpLastStep !== null && changes.totpLastStep <= row.totpLastStep) throw new DomainError("unauthorized", "That code was already used. Wait for a new code.")
          if (changes.recoveryCodes !== undefined && row.totpEnabledAt && changes.totpEnabledAt === undefined) {
            const current = await db.select({ value: staffRecoveryCodes.value }).from(staffRecoveryCodes).where(and(eq(staffRecoveryCodes.storeId, actor.storeId), eq(staffRecoveryCodes.userId, userId))).for("update")
            // Consuming a recovery code must still remove exactly one current hash.
            if (actor.kind === "system" && actor.purpose === "auth:staff") {
              if (changes.recoveryCodes.length !== current.length - 1 || changes.recoveryCodes.some((value) => !current.some((code) => code.value === value))) throw new DomainError("unauthorized", "That recovery code was already used.")
            } else if (actor.kind === "staff" && (!actor.mfaVerifiedAt || Date.parse(actor.mfaVerifiedAt) + 600_000 < Date.now())) throw new DomainError("forbidden", "Confirm it's you with your authenticator code to continue.", { stepUp: true })
          }
          const { recoveryCodes: codes, userId: _user, storeId: _store, ...rest } = changes
          const values = { ...rest, ...(rest.email !== undefined ? { email: rest.email.trim().toLowerCase() } : {}), ...(rest.createdAt !== undefined ? { createdAt: sqlDate(rest.createdAt) } : {}), ...(rest.totpEnabledAt !== undefined ? { totpEnabledAt: nullableSqlDate(rest.totpEnabledAt) } : {}), ...(rest.lockedUntil !== undefined ? { lockedUntil: nullableSqlDate(rest.lockedUntil) } : {}), ...(rest.lastSeenAt !== undefined ? { lastSeenAt: nullableSqlDate(rest.lastSeenAt) } : {}), updatedAt: sqlDate(new Date(Math.max(Date.now(), Date.parse(isoDate(row.updatedAt)) + 1)).toISOString()) }
          await db.update(staffMembers).set(values).where(where)
          if (codes !== undefined) {
            await db.delete(staffRecoveryCodes).where(and(eq(staffRecoveryCodes.storeId, actor.storeId), eq(staffRecoveryCodes.userId, userId)))
            if (codes.length) await db.insert(staffRecoveryCodes).values(codes.map((value, position) => ({ userId, storeId, value, position })))
          }
          if (rest.status === "suspended" || rest.passwordHash !== undefined) await db.update(staffSessions).set({ revokedAt: sqlNow() }).where(and(eq(staffSessions.storeId, actor.storeId), eq(staffSessions.userId, userId), isNull(staffSessions.revokedAt)))
          saved = await member(db, actor, (await db.select(memberProjection(actor, own)).from(staffMembers).where(where))[0])
        })
        return saved!
      })
    },
    async syncRegistry(actor, storeId, definitions, presets) {
      requireStore(actor, storeId); requireSystem(actor, ["auth:staff", "bootstrap", "migration"])
      await withTransaction(async (db) => {
        await storeLock(db, actor)
        for (const definition of definitions) await db.insert(permissions).values({ ...definition, sensitive: definition.sensitive ? 1 : 0 }).onDuplicateKeyUpdate({ set: { label: definition.label, group: definition.group, sensitive: definition.sensitive ? 1 : 0 } })
        for (const preset of presets) {
          const where = and(eq(roles.storeId, actor.storeId), eq(roles.key, preset.key))
          const [existing] = await db.select({ id: roles.id }).from(roles).where(where).for("update")
          const id = existing?.id ?? uuidv7()
          const values = { name: preset.name, description: preset.description, refundLimit: preset.refundLimit, isSystem: 1 }
          if (existing) await db.update(roles).set(values).where(where)
          else await db.insert(roles).values({ id, storeId, key: preset.key, ...values })
          await replacePermissions(db, id, preset.permissions)
        }
      })
    },
    async listRoles(actor, storeId) {
      readMember(actor, storeId)
      const db = await database()
      return roleRows(db, actor, await db.select().from(roles).where(eq(roles.storeId, actor.storeId)))
    },
    async findRole(actor, storeId, key) {
      readMember(actor, storeId)
      const db = await database()
      return (await roleRows(db, actor, await db.select().from(roles).where(and(eq(roles.storeId, actor.storeId), eq(roles.key, key))).limit(1)))[0] ?? null
    },
    async createRole(actor, input) {
      requireStore(actor, input.storeId); manage(actor, "roles:manage"); canGrant(actor, input.permissions, [input.key])
      if (input.isSystem) throw new DomainError("forbidden", "System roles are managed by the registry.")
      return withTransaction(async (db) => {
        await storeLock(db, actor)
        const { permissions: granted, isSystem: _system, ...rest } = input
        await db.insert(roles).values({ ...rest, isSystem: 0, createdAt: sqlDate(input.createdAt), updatedAt: sqlDate(input.updatedAt) })
        await replacePermissions(db, input.id, granted)
        return structuredClone(input)
      })
    },
    async updateRole(actor, storeId, key, changes, expectedUpdatedAt) {
      requireStore(actor, storeId); manage(actor, "roles:manage"); canGrant(actor, changes.permissions ?? [])
      if (key === OWNER_ROLE_KEY) throw new DomainError("forbidden", "The Owner role cannot be edited.")
      return withTransaction(async (db) => {
        await storeLock(db, actor)
        const where = and(eq(roles.storeId, actor.storeId), eq(roles.key, key))
        const [row] = await db.select().from(roles).where(where).for("update")
        if (!row) throw new DomainError("not_found", "Role not found.")
        if (expectedUpdatedAt && isoDate(row.updatedAt) !== expectedUpdatedAt) throw new DomainError("conflict", "Someone else changed this role. Reload to see their changes.")
        const { permissions: granted, ...rest } = changes
        await db.update(roles).set({ ...rest, updatedAt: sqlDate(new Date(Math.max(Date.now(), Date.parse(isoDate(row.updatedAt)) + 1)).toISOString()) }).where(where)
        if (granted) await replacePermissions(db, row.id, granted)
        const members = await db.select({ id: staffRoles.userId }).from(staffRoles).where(and(eq(staffRoles.storeId, actor.storeId), eq(staffRoles.roleId, row.id)))
        if (members.length) await db.update(staffSessions).set({ revokedAt: sqlNow() }).where(and(eq(staffSessions.storeId, actor.storeId), inArray(staffSessions.userId, members.map((entry) => entry.id)), isNull(staffSessions.revokedAt)))
        return (await roleRows(db, actor, await db.select().from(roles).where(where)))[0]
      })
    },
    async deleteRole(actor, storeId, key) {
      requireStore(actor, storeId); manage(actor, "roles:manage")
      await withTransaction(async (db) => {
        await storeLock(db, actor)
        const where = and(eq(roles.storeId, actor.storeId), eq(roles.key, key))
        const [row] = await db.select().from(roles).where(where).for("update")
        if (!row) throw new DomainError("not_found", "Role not found.")
        if (row.isSystem) throw new DomainError("forbidden", "System roles cannot be deleted.")
        const [used] = await db.select({ id: staffRoles.userId }).from(staffRoles).where(and(eq(staffRoles.storeId, actor.storeId), eq(staffRoles.roleId, row.id))).limit(1)
        if (used) throw new DomainError("conflict", "Staff members still have this role. Change their roles first.")
        await db.delete(roles).where(where)
      })
    },
    async rolesOf(actor, storeId, userId) {
      readMember(actor, storeId, userId)
      const db = await database()
      return roleRows(db, actor, await db.select(getTableColumns(roles)).from(roles).innerJoin(staffRoles, eq(staffRoles.roleId, roles.id)).where(and(eq(roles.storeId, actor.storeId), eq(staffRoles.storeId, actor.storeId), eq(staffRoles.userId, userId))))
    },
    async setRoles(actor, storeId, userId, roleKeys) {
      requireStore(actor, storeId); manage(actor)
      await withTransaction(async (db) => {
        await keepsOwner(db, actor, async () => {
          const [target] = await db.select({ id: staffMembers.userId }).from(staffMembers).where(and(eq(staffMembers.storeId, actor.storeId), eq(staffMembers.userId, userId))).for("update")
          if (!target) throw new DomainError("not_found", "Staff member not found.")
          const selected = roleKeys.length ? await roleRows(db, actor, await db.select().from(roles).where(and(eq(roles.storeId, actor.storeId), inArray(roles.key, [...new Set(roleKeys)])))) : []
          if (selected.length !== new Set(roleKeys).size) throw new DomainError("validation", "Unknown role.")
          canGrant(actor, selected.flatMap((role) => role.permissions), roleKeys)
          await db.delete(staffRoles).where(and(eq(staffRoles.storeId, actor.storeId), eq(staffRoles.userId, userId)))
          if (selected.length) await db.insert(staffRoles).values(selected.map((role) => ({ storeId, userId, roleId: role.id })))
          await db.update(staffSessions).set({ revokedAt: sqlNow() }).where(and(eq(staffSessions.storeId, actor.storeId), eq(staffSessions.userId, userId), isNull(staffSessions.revokedAt)))
        })
      })
    },
    async countActiveOwners(actor, storeId) {
      readMember(actor, storeId)
      return ownerCount(await database(), actor.storeId)
    },
    async createInvite(actor, input) {
      requireStore(actor, input.storeId); manage(actor)
      return withTransaction(async (db) => {
        await storeLock(db, actor)
        const selected = (await roleRows(db, actor, await db.select().from(roles).where(and(eq(roles.storeId, actor.storeId), eq(roles.key, input.roleKey)))))[0]
        if (!selected) throw new DomainError("validation", "Unknown role.")
        canGrant(actor, selected.permissions, [selected.key])
        await db.insert(staffInvites).values({ ...input, createdAt: sqlDate(input.createdAt), expiresAt: sqlDate(input.expiresAt), acceptedAt: nullableSqlDate(input.acceptedAt), revokedAt: nullableSqlDate(input.revokedAt) })
        return structuredClone(input)
      })
    },
    async findInviteByTokenHash(actor, tokenHash) {
      requireSystem(actor, ["auth:staff", "bootstrap", "migration"])
      const db = await database()
      const [row] = await db.select().from(staffInvites).where(and(eq(staffInvites.storeId, actor.storeId), eq(staffInvites.tokenHash, tokenHash))).limit(1)
      return row ? invite(row) : null
    },
    async updateInvite(actor, id, changes) {
      manage(actor)
      if (changes.id !== undefined || changes.storeId !== undefined || changes.tokenHash !== undefined || changes.email !== undefined || changes.roleKey !== undefined || changes.invitedBy !== undefined) throw new DomainError("validation", "Invite identity cannot be changed.")
      if (!auth(actor) && changes.acceptedAt !== undefined) throw new DomainError("forbidden", "Only invite acceptance can consume an invite.")
      const db = await database()
      const values = { ...(changes.acceptedAt !== undefined ? { acceptedAt: nullableSqlDate(changes.acceptedAt) } : {}), ...(changes.revokedAt !== undefined ? { revokedAt: nullableSqlDate(changes.revokedAt) } : {}), ...(changes.expiresAt !== undefined ? { expiresAt: sqlDate(changes.expiresAt) } : {}) }
      const where = and(eq(staffInvites.id, id), eq(staffInvites.storeId, actor.storeId), changes.acceptedAt ? isNull(staffInvites.acceptedAt) : undefined)
      const [result] = await db.update(staffInvites).set(values).where(where)
      if (!result.affectedRows && changes.acceptedAt) throw new DomainError("conflict", "This invite was already used.")
    },
    async listInvites(actor, storeId) {
      readMember(actor, storeId)
      const db = await database()
      return (await db.select().from(staffInvites).where(eq(staffInvites.storeId, actor.storeId))).map(invite)
    },
    async createSession(actor, input) {
      requireStore(actor, input.storeId); requireSystem(actor, ["auth:staff", "bootstrap", "migration"])
      await withTransaction(async (db) => {
        const [owner] = await db.select({ id: staffMembers.userId }).from(staffMembers).where(and(eq(staffMembers.storeId, actor.storeId), eq(staffMembers.userId, input.userId), eq(staffMembers.status, "active"))).for("update")
        if (!owner) throw new DomainError("unauthorized", "Your sign-in expired. Please sign in again.")
        await db.insert(staffSessions).values({ ...input, createdAt: sqlDate(input.createdAt), lastSeenAt: sqlDate(input.lastSeenAt), expiresAt: sqlDate(input.expiresAt), mfaAt: nullableSqlDate(input.mfaAt), revokedAt: nullableSqlDate(input.revokedAt) })
      })
    },
    async findSessionByTokenHash(actor, tokenHash) {
      requireSystem(actor, ["auth:staff", "bootstrap", "migration"])
      const db = await database()
      const [row] = await db.select().from(staffSessions).where(and(eq(staffSessions.storeId, actor.storeId), eq(staffSessions.tokenHash, tokenHash))).limit(1)
      return row ? session(row) : null
    },
    async updateSession(actor, id, changes) {
      requireSystem(actor, ["auth:staff", "bootstrap", "migration"])
      if (changes.id !== undefined || changes.userId !== undefined || changes.storeId !== undefined || changes.tokenHash !== undefined) throw new DomainError("validation", "Session identity cannot be changed.")
      const db = await database()
      const { createdAt, lastSeenAt, expiresAt, mfaAt, revokedAt, ...rest } = changes
      await db.update(staffSessions).set({ ...rest, ...(createdAt !== undefined ? { createdAt: sqlDate(createdAt) } : {}), ...(lastSeenAt !== undefined ? { lastSeenAt: sqlDate(lastSeenAt) } : {}), ...(expiresAt !== undefined ? { expiresAt: sqlDate(expiresAt) } : {}), ...(mfaAt !== undefined ? { mfaAt: nullableSqlDate(mfaAt) } : {}), ...(revokedAt !== undefined ? { revokedAt: nullableSqlDate(revokedAt) } : {}) }).where(and(eq(staffSessions.id, id), eq(staffSessions.storeId, actor.storeId)))
    },
    async listSessions(actor, storeId, userId) {
      readMember(actor, storeId, userId)
      const db = await database()
      return (await db.select().from(staffSessions).where(and(eq(staffSessions.storeId, actor.storeId), eq(staffSessions.userId, userId)))).map(session)
    },
    async revokeSessions(actor, storeId, userId, keepSessionId) {
      requireStore(actor, storeId)
      if (!(actor.kind === "staff" && actor.id === userId)) manage(actor)
      const db = await database()
      await db.update(staffSessions).set({ revokedAt: sqlNow() }).where(and(eq(staffSessions.storeId, actor.storeId), eq(staffSessions.userId, userId), isNull(staffSessions.revokedAt), keepSessionId ? ne(staffSessions.id, keepSessionId) : undefined))
    },
  }
}
