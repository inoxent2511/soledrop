import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"
import { cache } from "react"
import { serverEnv } from "@/lib/env.server"
import { hashToken } from "@/server/admin/crypto"
import type { Customer } from "@/server/customers/types"
import { anonymousActor, staffActor, type Actor } from "./actor"
import type { StaffContext } from "@/server/admin/types"

type Scope = { actor: Actor }
const globals = globalThis as typeof globalThis & { __soledropActorRequests?: AsyncLocalStorage<Scope>; __soledropActorRenderScope?: () => Scope }
const requests = globals.__soledropActorRequests ??= new AsyncLocalStorage<Scope>()
// React cache is per render pass. Route handlers use AsyncLocalStorage instead; neither
// enterWith-after-await nor a process-global mutable identity can safely carry a request.
// Reuse the cache function's identity across separately bundled RSC modules too.
const renderScope = globals.__soledropActorRenderScope ??= cache((): Scope => ({ actor: anonymousActor(serverEnv.STORE_ID) }))
const scope = () => requests.getStore() ?? renderScope()

/** Missing context is always anonymous. System capabilities are selected explicitly by services. */
export const currentActor = (): Actor => scope().actor

export function withActor<T>(actor: Actor, operation: () => T): T {
  return requests.run({ actor }, operation)
}

export function establishActor(actor: Actor): void {
  scope().actor = actor
}

export function establishCustomer(customer: Customer, sessionToken: string): void {
  const previous = currentActor()
  const capabilities = previous.kind === "anonymous" || previous.kind === "customer" ? { cartTokenHash: previous.cartTokenHash, orderAccessTokenHash: previous.orderAccessTokenHash } : {}
  establishActor({ ...capabilities, kind: "customer", id: customer.id, email: customer.email, storeId: customer.storeId, permissions: [], mfaVerifiedAt: null, sessionTokenHash: hashToken(sessionToken) })
}

export function establishStaff(staff: StaffContext): void {
  establishActor(staffActor(staff))
}

export function establishCartToken(token: string | undefined): void {
  const actor = currentActor()
  if (actor.kind === "anonymous" || actor.kind === "customer") establishActor({ ...actor, cartTokenHash: token ? hashToken(token) : undefined })
}

export function establishOrderToken(token: string | null): void {
  const actor = currentActor()
  if (actor.kind === "anonymous" || actor.kind === "customer") establishActor({ ...actor, orderAccessTokenHash: token ? hashToken(token) : undefined })
}

export function establishOrderLookup(number: string, email: string): void {
  const actor = currentActor()
  if (actor.kind === "anonymous" || actor.kind === "customer") establishActor({ ...actor, orderLookup: { number: number.trim().toUpperCase(), email: email.trim().toLowerCase() } })
}

export function establishCheckoutEmail(email: string): void {
  const actor = currentActor()
  if (actor.kind === "anonymous") establishActor({ ...actor, checkoutEmail: email.trim().toLowerCase() })
}
