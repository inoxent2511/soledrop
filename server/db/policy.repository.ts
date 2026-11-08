import "server-only"

import { and, eq, inArray } from "drizzle-orm"
import { ACTOR_SCOPED, assertActor, attenuateStaffActor, type Actor, type ActorScoped } from "./actor"
import { type Database, withTransaction } from "./client"
import { isPermission } from "@/server/admin/permissions"
import { rolePermissions, roles, staffMembers, staffRoles, staffSessions, stores } from "./schema"
import { isoDate } from "./values"
import { DomainError } from "@/server/shared/errors"

// Cache only inside a single database transaction. A self-revoking change must still be able
// to append its mandatory audit before commit; the next transaction revalidates from scratch.
const admitted = new WeakMap<Database, Map<string, Actor>>()

/** Linearizes staff authorization with revocation/role writes using the common store lock. */
export async function currentStaffActor(db: Database, actor: Extract<Actor, { kind: "staff" }>): Promise<Actor> {
  let scope = admitted.get(db)
  if (!scope) { scope = new Map(); admitted.set(db, scope) }
  const key = actor.storeId + ":" + actor.id + ":" + actor.sessionId
  const cached = scope.get(key)
  if (cached) return attenuateStaffActor(cached, actor)

  const [store] = await db.select({ id: stores.id }).from(stores).where(eq(stores.id, actor.storeId)).for("update")
  if (!store) throw new DomainError("forbidden", "You don't have access to this store.")
  const [identity] = await db.select({ status: staffMembers.status, enrolled: staffMembers.totpEnabledAt, aal: staffSessions.aal, mfaAt: staffSessions.mfaAt, createdAt: staffSessions.createdAt, lastSeenAt: staffSessions.lastSeenAt, expiresAt: staffSessions.expiresAt, revokedAt: staffSessions.revokedAt }).from(staffSessions).innerJoin(staffMembers, and(eq(staffMembers.userId, staffSessions.userId), eq(staffMembers.storeId, staffSessions.storeId))).where(and(eq(staffSessions.id, actor.sessionId), eq(staffSessions.userId, actor.id), eq(staffSessions.storeId, actor.storeId))).for("update")
  const at = Date.now()
  if (!identity || identity.status !== "active" || !identity.enrolled || identity.aal !== 2 || !identity.mfaAt || identity.revokedAt || Date.parse(isoDate(identity.expiresAt)) <= at || Date.parse(isoDate(identity.createdAt)) + 43_200_000 <= at || Date.parse(isoDate(identity.lastSeenAt)) + 1_800_000 <= at || Date.parse(isoDate(identity.mfaAt)) > at + 30_000) throw new DomainError("unauthorized", "Your staff session ended. Please sign in again.")
  const assigned = await db.select({ id: roles.id, key: roles.key, refundLimit: roles.refundLimit }).from(staffRoles).innerJoin(roles, and(eq(roles.id, staffRoles.roleId), eq(roles.storeId, staffRoles.storeId))).where(and(eq(staffRoles.storeId, actor.storeId), eq(staffRoles.userId, actor.id))).orderBy(roles.id).for("update")
  const links = assigned.length ? await db.select({ roleId: rolePermissions.roleId, permission: rolePermissions.permission }).from(rolePermissions).where(inArray(rolePermissions.roleId, assigned.map((role) => role.id))).orderBy(rolePermissions.roleId, rolePermissions.permission).for("update") : []
  const permissions = [...new Set(links.map((link) => link.permission).filter(isPermission))]
  const refunders = assigned.filter((role) => links.some((link) => link.roleId === role.id && link.permission === "orders:refund"))
  const currentLimit = !refunders.length ? 0 : refunders.some((role) => role.refundLimit === null) ? null : Math.max(...refunders.map((role) => role.refundLimit ?? 0))
  const effective: Actor = { ...actor, permissions, roleKeys: assigned.map((role) => role.key), refundLimit: currentLimit, mfaVerifiedAt: isoDate(identity.mfaAt) }
  scope.set(key, effective)
  return attenuateStaffActor(effective, actor)
}

/** All public factory methods retain a required actor and validate staff authority from live rows. */
export function mysqlPolicy<T extends object>(repository: ActorScoped<T>): ActorScoped<T> {
  return new Proxy(repository, {
    get(target, property) {
      if (property === ACTOR_SCOPED) return true
      const operation: unknown = Reflect.get(target, property)
      if (typeof operation !== "function") return operation
      return async (actor: Actor, ...args: unknown[]) => {
        assertActor(actor)
        if (actor.kind !== "staff") return Reflect.apply(operation, target, [actor, ...args])
        return withTransaction(async (db) => Reflect.apply(operation, target, [await currentStaffActor(db, actor), ...args]))
      }
    },
  })
}
