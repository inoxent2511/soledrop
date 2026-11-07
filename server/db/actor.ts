import type { Permission } from "@/server/admin/permissions"
import type { StaffContext } from "@/server/admin/types"
import { DomainError } from "@/server/shared/errors"

export type SystemPurpose = "auth:customer" | "auth:staff" | "bootstrap" | "migration" | "jobs" | "integration" | "notifications"
type Base = { storeId: string; permissions: readonly Permission[]; mfaVerifiedAt: string | null }
export type Actor = Base & (
  | { kind: "anonymous"; id: null; cartTokenHash?: string; orderAccessTokenHash?: string; checkoutEmail?: string; orderLookup?: { number: string; email: string } }
  | { kind: "customer"; id: string; email: string; cartTokenHash?: string; orderAccessTokenHash?: string }
  | { kind: "staff"; id: string; sessionId: string; refundLimit: number | null; roleKeys: readonly string[] }
  | { kind: "system"; id: string; purpose: SystemPurpose }
)

/** Raw repository methods require an actor; services receive an explicitly bound facade. */
export type ActorScoped<T> = { [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (actor: Actor, ...args: A) => R : never }

export function anonymousActor(storeId: string): Actor {
  return { kind: "anonymous", id: null, storeId, permissions: [], mfaVerifiedAt: null }
}

export function staffActor(staff: StaffContext): Actor {
  return { kind: "staff", id: staff.member.userId, storeId: staff.member.storeId, sessionId: staff.session.id, permissions: staff.permissions, mfaVerifiedAt: staff.session.aal === 2 ? staff.session.mfaAt : null, refundLimit: staff.refundLimit, roleKeys: staff.roles.map((role) => role.key) }
}

export function systemActor(storeId: string, purpose: SystemPurpose, permissions: readonly Permission[] = []): Actor {
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
  if (actor.kind === "system" && ["auth:customer", "migration", "jobs"].includes(actor.purpose)) return
  if (staffPermission) { requireGrant(actor, staffPermission); return }
  throw new DomainError("forbidden", "You don't have access to this account.")
}
