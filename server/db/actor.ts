import { isPermission, type Permission } from "@/server/admin/permissions"
import type { StaffContext } from "@/server/admin/types"
import { DomainError } from "@/server/shared/errors"
import { uuidToBytes } from "./uuid"

export type SystemPurpose = "auth:customer" | "auth:staff" | "bootstrap" | "migration" | "jobs" | "integration" | "notifications"
type Base = { storeId: string; permissions: readonly Permission[]; mfaVerifiedAt: string | null }
export type Actor = Base & (
  | { kind: "anonymous"; id: null; cartTokenHash?: string; orderAccessTokenHash?: string; checkoutEmail?: string; orderLookup?: { number: string; email: string } }
  | { kind: "customer"; id: string; email: string; sessionTokenHash?: string; cartTokenHash?: string; orderAccessTokenHash?: string; orderLookup?: { number: string; email: string } }
  | { kind: "staff"; id: string; sessionId: string; refundLimit: number | null; roleKeys: readonly string[] }
  | { kind: "system"; id: string; purpose: SystemPurpose }
)

/** Raw repository methods require an actor; services receive an explicitly bound facade. */
export type ActorScoped<T> = { [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (actor: Actor, ...args: A) => R : never }
export type ActorBound<T> = { [K in keyof T]: T[K] extends (actor: Actor, ...args: infer A) => infer R ? (...args: A) => R : never }
export const ACTOR_SCOPED = Symbol.for("soledrop.actor-scoped-repository")

export function isActorScoped<T extends object>(repository: T | ActorScoped<T>): repository is ActorScoped<T> {
  return Reflect.get(repository, ACTOR_SCOPED) === true
}

export function assertActor(value: Actor): void {
  if (!value || !["anonymous", "customer", "staff", "system"].includes(value.kind) || !Array.isArray(value.permissions) || value.permissions.some((permission) => !isPermission(permission))) throw new DomainError("forbidden", "A valid actor is required.")
  try { uuidToBytes(value.storeId) } catch { throw new DomainError("forbidden", "A valid store is required.") }
  if (value.mfaVerifiedAt !== null && (typeof value.mfaVerifiedAt !== "string" || !Number.isFinite(Date.parse(value.mfaVerifiedAt)))) throw new DomainError("forbidden", "A valid actor proof is required.")
  if (value.kind === "staff" || value.kind === "customer") {
    try { uuidToBytes(value.id); if (value.kind === "staff") uuidToBytes(value.sessionId) } catch { throw new DomainError("forbidden", "A valid identity is required.") }
  }
  if (value.kind === "staff" && (!Array.isArray(value.roleKeys) || value.roleKeys.some((key) => typeof key !== "string") || value.refundLimit !== null && (!Number.isSafeInteger(value.refundLimit) || value.refundLimit < 0))) throw new DomainError("forbidden", "A valid staff scope is required.")
  if (value.kind === "anonymous" && value.id !== null || value.kind === "customer" && typeof value.email !== "string" || value.kind === "system" && (!value.id || !["auth:customer", "auth:staff", "bootstrap", "migration", "jobs", "integration", "notifications"].includes(value.purpose))) throw new DomainError("forbidden", "A valid actor scope is required.")
}

/** A caller can narrow its authority, but never inflate stored grants, roles, limits or proof. */
export function attenuateStaffActor(current: Actor, requested: Extract<Actor, { kind: "staff" }>): Actor {
  if (current.kind !== "staff") throw new DomainError("forbidden", "A staff identity is required.")
  const proof = requested.mfaVerifiedAt ? Date.parse(requested.mfaVerifiedAt) : NaN
  return { ...requested, permissions: requested.permissions.filter((permission) => current.permissions.includes(permission)), roleKeys: requested.roleKeys.filter((role) => current.roleKeys.includes(role)), refundLimit: requested.refundLimit === null ? current.refundLimit : current.refundLimit === null ? requested.refundLimit : Math.min(requested.refundLimit, current.refundLimit), mfaVerifiedAt: Number.isFinite(proof) && current.mfaVerifiedAt ? new Date(Math.min(proof, Date.parse(current.mfaVerifiedAt))).toISOString() : null }
}

export function anonymousActor(storeId: string): Extract<Actor, { kind: "anonymous" }> {
  return { kind: "anonymous", id: null, storeId, permissions: [], mfaVerifiedAt: null }
}

export function staffActor(staff: StaffContext): Extract<Actor, { kind: "staff" }> {
  return { kind: "staff", id: staff.member.userId, storeId: staff.member.storeId, sessionId: staff.session.id, permissions: staff.permissions, mfaVerifiedAt: staff.session.aal === 2 ? staff.session.mfaAt : null, refundLimit: staff.refundLimit, roleKeys: staff.roles.map((role) => role.key) }
}

export function systemActor(storeId: string, purpose: SystemPurpose, permissions: readonly Permission[] = []): Extract<Actor, { kind: "system" }> {
  return { kind: "system", id: purpose, storeId, purpose, permissions, mfaVerifiedAt: null }
}

export function requireStore(actor: Actor, storeId: string): void {
  if (!actor || !storeId || actor.storeId !== storeId) throw new DomainError("forbidden", "You don't have access to this store.")
}

export function requireGrant(actor: Actor, permission: Permission): void {
  if (!actor || !["staff", "system"].includes(actor.kind) || !actor.permissions.includes(permission)) throw new DomainError("forbidden", "You don't have permission to do that.", { permission })
  if (actor.kind === "staff" && (!actor.mfaVerifiedAt || !Number.isFinite(Date.parse(actor.mfaVerifiedAt)))) throw new DomainError("unauthorized", "Finish two-step verification first.")
}

export function requireFreshGrant(actor: Actor, permission: Permission): void {
  requireGrant(actor, permission)
  if (actor.kind === "staff" && Date.parse(actor.mfaVerifiedAt!) + 600_000 < Date.now()) throw new DomainError("forbidden", "Confirm it's you with your authenticator code to continue.", { stepUp: true })
}

export function requireSystem(actor: Actor, purposes: readonly SystemPurpose[]): void {
  if (actor.kind !== "system" || !purposes.includes(actor.purpose)) throw new DomainError("forbidden", "This operation requires a trusted server capability.")
}

export function requireCustomerOwner(actor: Actor, customerId: string, staffPermission?: Permission): void {
  if (actor.kind === "customer" && actor.id === customerId) return
  if (actor.kind === "system" && ["auth:customer", "migration"].includes(actor.purpose)) return
  if (staffPermission) { requireGrant(actor, staffPermission); return }
  throw new DomainError("forbidden", "You don't have access to this account.")
}
