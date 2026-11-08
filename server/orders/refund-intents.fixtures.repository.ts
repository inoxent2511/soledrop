import "server-only"
import { requireFreshGrant, requireGrant, type Actor } from "@/server/db/actor"
import { fixtureActorPolicy } from "@/server/db/fixtures-policy.repository"
import { fixtureAtomic } from "@/server/fixtures/atomic"
import { db } from "@/server/fixtures/store"
import { DomainError } from "@/server/shared/errors"
import { assertRefundReplay, prepareRefundIntent } from "./refund-intent"
import type { RefundIntentRepository } from "./refund-intents.repository"
import { newId, now } from "@/server/shared/ids"

function authority(actor: Actor, amount?: number) {
  requireFreshGrant(actor, "orders:refund")
  if (actor.kind === "staff" && actor.refundLimit !== null && amount !== undefined && amount > actor.refundLimit) throw new DomainError("forbidden", "This refund exceeds your role's limit.")
}

export function createFixturesRefundIntentsRepository(): RefundIntentRepository {
  return fixtureActorPolicy<RefundIntentRepository>({
    async pending(actor, limit) {
      authority(actor)
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DomainError("validation", "Invalid pending refund limit.")
      return structuredClone((db().refundIntents ?? []).filter((row) => row.storeId === actor.storeId && row.status !== "completed").sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).slice(0, limit))
    },
    async find(actor, id) {
      authority(actor)
      return structuredClone(db().refundIntents?.find((row) => row.storeId === actor.storeId && row.id === id) ?? null)
    },
    async prepare(actor, input) {
      authority(actor, input.amount); requireGrant(actor, "orders:read")
      return fixtureAtomic(async () => {
        const tables = db(), order = tables.orders.find((row) => row.storeId === actor.storeId && row.id === input.orderId)
        if (!order) throw new DomainError("not_found", "Order not found.")
        const refund = tables.refunds.find((row) => row.orderId === order.id && row.idempotencyKey === input.idempotencyKey)
        if (refund) { assertRefundReplay(refund, input); return { intent: null, refund: structuredClone(refund) } }
        const pending = (tables.refundIntents ??= []).filter((row) => row.storeId === actor.storeId && row.orderId === order.id)
        const replay = pending.find((row) => row.idempotencyKey === input.idempotencyKey)
        if (replay) { assertRefundReplay(replay.request, input); return { intent: structuredClone(replay), refund: null } }
        const intent = prepareRefundIntent(order, tables.payments.filter((row) => row.orderId === order.id), pending, input)
        tables.refundIntents.push(intent)
        tables.audit.push({ id: newId(), at: now(), storeId: actor.storeId, actor: actor.id ?? "system", action: "refund.requested", entity: "refund_intent", entityId: intent.id, before: null, after: { orderId: order.id, amount: input.amount, reason: input.reason } })
        return { intent: structuredClone(intent), refund: null }
      })
    },
    async confirm(actor, id, reference) {
      authority(actor)
      return fixtureAtomic(async () => {
        const intent = db().refundIntents?.find((row) => row.storeId === actor.storeId && row.id === id)
        if (!intent) throw new DomainError("not_found", "Refund intent not found.")
        authority(actor, intent.request.amount)
        if (intent.status !== "prepared") {
          if (intent.providerRefundRef !== reference) throw new DomainError("conflict", "The provider returned conflicting refund references. Reconcile this refund.")
          return
        }
        intent.status = "provider_confirmed"; intent.providerRefundRef = reference
        db().audit.push({ id: newId(), at: now(), storeId: actor.storeId, actor: actor.id ?? "system", action: "refund.provider_confirmed", entity: "refund_intent", entityId: id, before: null, after: { providerRefundRef: reference } })
      })
    },
  })
}
