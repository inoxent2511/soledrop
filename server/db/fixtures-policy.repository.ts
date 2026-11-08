import "server-only"

import { ACTOR_SCOPED, assertActor, attenuateStaffActor, type Actor, type ActorScoped } from "./actor"
import { db, withFixtureStore } from "@/server/fixtures/store"
import { isPermission } from "@/server/admin/permissions"
import { DomainError } from "@/server/shared/errors"
import { fixtureAdmissions } from "@/server/fixtures/atomic"

export type FixtureGuards<T> = { [K in keyof T]: T[K] extends (...args: infer A) => unknown ? (actor: Actor, ...args: A) => void : never }
export type FixtureProjections<T> = { [K in keyof T]?: T[K] extends (...args: infer A) => infer R ? (actor: Actor, result: Awaited<R>, ...args: A) => Awaited<R> : never }

function currentFixtureActor(actor: Actor): Actor {
  if (actor.kind !== "staff") return actor
  const admissions = fixtureAdmissions(), key = actor.storeId + ":" + actor.id + ":" + actor.sessionId
  const admitted = admissions?.get(key)
  if (admitted) return attenuateStaffActor(admitted, actor)
  const tables = db(), at = Date.now()
  const member = tables.staffMembers.find((row) => row.storeId === actor.storeId && row.userId === actor.id)
  const session = tables.staffSessions.find((row) => row.storeId === actor.storeId && row.userId === actor.id && row.id === actor.sessionId)
  if (!member || member.status !== "active" || !member.totpEnabledAt || !session || session.aal !== 2 || !session.mfaAt || session.revokedAt || Date.parse(session.expiresAt) <= at || Date.parse(session.createdAt) + 43_200_000 <= at || Date.parse(session.lastSeenAt) + 1_800_000 <= at || Date.parse(session.mfaAt) > at + 30_000) throw new DomainError("unauthorized", "Your staff session ended. Please sign in again.")
  const roles = tables.adminRoles.filter((role) => role.storeId === actor.storeId && tables.staffRoleLinks.some((link) => link.storeId === actor.storeId && link.userId === actor.id && link.roleId === role.id))
  const refunders = roles.filter((role) => role.permissions.includes("orders:refund"))
  const refundLimit = !refunders.length ? 0 : refunders.some((role) => role.refundLimit === null) ? null : Math.max(...refunders.map((role) => role.refundLimit ?? 0))
  const effective: Actor = { ...actor, permissions: [...new Set(roles.flatMap((role) => role.permissions).filter(isPermission))], roleKeys: roles.map((role) => role.key), refundLimit, mfaVerifiedAt: session.mfaAt }
  admissions?.set(key, effective)
  return attenuateStaffActor(effective, actor)
}

/** For new fixture repositories that already declare/check an actor on every method. */
export function fixtureActorPolicy<T extends object>(repository: T): T {
  return new Proxy(repository, {
    get(target, property) {
      if (property === ACTOR_SCOPED) return true
      const operation: unknown = Reflect.get(target, property)
      if (typeof operation !== "function") return operation
      return async (actor: Actor, ...args: unknown[]) => {
        assertActor(actor)
        return withFixtureStore(actor, () => Reflect.apply(operation, target, [currentFixtureActor(actor), ...args]))
      }
    },
  })
}

/** Required guards cover every method; each operation queries only the actor's isolated store. */
export function fixturePolicy<T extends object>(operations: T, guards: FixtureGuards<T>, projections: FixtureProjections<T> = {}): ActorScoped<T> {
  return new Proxy(operations, {
    get(target, property) {
      if (property === ACTOR_SCOPED) return true
      const operation: unknown = Reflect.get(target, property)
      if (typeof operation !== "function") return operation
      return async (actor: Actor, ...args: unknown[]) => {
        assertActor(actor)
        return withFixtureStore(actor, async () => {
          const effective = currentFixtureActor(actor), guard: unknown = Reflect.get(guards, property), project: unknown = Reflect.get(projections, property)
          if (typeof guard !== "function") throw new DomainError("forbidden", "This operation has no declared authorization policy.")
          Reflect.apply(guard, guards, [effective, ...args])
          const result: unknown = await Reflect.apply(operation, target, args)
          return structuredClone(typeof project === "function" ? Reflect.apply(project, projections, [effective, result, ...args]) : result)
        })
      }
    },
  }) as unknown as ActorScoped<T>
}
