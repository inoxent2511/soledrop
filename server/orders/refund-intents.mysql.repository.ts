import "server-only"
import { and, asc, eq, ne } from "drizzle-orm"
import { requireFreshGrant, type Actor } from "@/server/db/actor"
import { withTransaction } from "@/server/db/client"
import { mysqlPolicy } from "@/server/db/policy.repository"
import { payments, refundIntents, refunds } from "@/server/db/schema"
import { isoDate, jsonValue, sqlDate } from "@/server/db/values"
import { lockStore } from "@/server/inventory/mysql.repository"
import { DomainError } from "@/server/shared/errors"
import { auditOrder, lockedOrder, payment, refund } from "./mysql-helpers.repository"
import { assertRefundReplay, prepareRefundIntent, type RefundInput, type RefundIntent } from "./refund-intent"
import type { RefundIntentOperations, RefundIntentRepository } from "./refund-intents.repository"

export function refundIntent(row: typeof refundIntents.$inferSelect): RefundIntent {
  return { ...row, status: row.status as RefundIntent["status"], request: jsonValue<RefundInput>(row.request), createdAt: isoDate(row.createdAt) }
}

export function refundAuthority(actor: Actor, amount?: number): void {
  requireFreshGrant(actor, "orders:refund")
  if (actor.kind === "staff" && actor.refundLimit !== null && amount !== undefined && amount > actor.refundLimit) throw new DomainError("forbidden", "This refund exceeds your role's limit.")
}

export function createMysqlRefundIntentsRepository(): RefundIntentRepository {
  return mysqlPolicy<RefundIntentOperations>({
    async pending(actor, limit) {
      refundAuthority(actor)
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DomainError("validation", "Invalid pending refund limit.")
      return withTransaction(async (db) => (await db.select().from(refundIntents).where(and(eq(refundIntents.storeId, actor.storeId), ne(refundIntents.status, "completed"))).orderBy(refundIntents.createdAt, refundIntents.id).limit(limit)).map(refundIntent))
    },
    async find(actor, id) {
      refundAuthority(actor)
      return withTransaction(async (db) => {
        const [row] = await db.select().from(refundIntents).where(and(eq(refundIntents.storeId, actor.storeId), eq(refundIntents.id, id))).limit(1)
        return row ? refundIntent(row) : null
      })
    },
    async prepare(actor, input) {
      refundAuthority(actor, input.amount)
      return withTransaction(async (db) => {
        await lockStore(db, actor)
        const order = await lockedOrder(db, actor, input.orderId)
        const [existing] = await db.select().from(refunds).where(and(eq(refunds.orderId, order.id), eq(refunds.idempotencyKey, input.idempotencyKey))).for("update")
        if (existing) { const saved = refund(existing); assertRefundReplay(saved, input); return { intent: null, refund: saved } }
        const pending = (await db.select().from(refundIntents).where(and(eq(refundIntents.storeId, actor.storeId), eq(refundIntents.orderId, order.id))).orderBy(refundIntents.id).for("update")).map(refundIntent)
        const replay = pending.find((row) => row.idempotencyKey === input.idempotencyKey)
        if (replay) { assertRefundReplay(replay.request, input); return { intent: replay, refund: null } }
        const paid = (await db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(asc(payments.id)).for("update")).map(payment)
        const intent = prepareRefundIntent(order, paid, pending, input)
        await db.insert(refundIntents).values({ ...intent, createdAt: sqlDate(intent.createdAt) })
        await auditOrder(db, actor, "refund.requested", "refund_intent", intent.id, null, { orderId: order.id, amount: input.amount, reason: input.reason })
        return { intent, refund: null }
      })
    },
    async confirm(actor, id, reference) {
      refundAuthority(actor)
      await withTransaction(async (db) => {
        await lockStore(db, actor)
        const where = and(eq(refundIntents.storeId, actor.storeId), eq(refundIntents.id, id))
        const [row] = await db.select().from(refundIntents).where(where).for("update")
        if (!row) throw new DomainError("not_found", "Refund intent not found.")
        refundAuthority(actor, jsonValue<RefundInput>(row.request).amount)
        if (row.status !== "prepared") {
          if (row.providerRefundRef !== reference) throw new DomainError("conflict", "The provider returned conflicting refund references. Reconcile this refund.")
          return
        }
        await db.update(refundIntents).set({ status: "provider_confirmed", providerRefundRef: reference }).where(where)
        await auditOrder(db, actor, "refund.provider_confirmed", "refund_intent", id, null, { providerRefundRef: reference })
      })
    },
  })
}
