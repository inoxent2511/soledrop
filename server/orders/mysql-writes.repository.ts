import "server-only"

import { and, asc, count, eq, getTableColumns, inArray, ne, or } from "drizzle-orm"
import type { OrderRepository } from "./repository"
import type { Order } from "./types"
import { canTransition, customerCanCancel, customerCanRequestReturn, restocksOnTransition } from "./state-machine"
import { allocateNumber, auditOrder, enqueueOrderEvent, hydrateOrders, lockedOrder, orderOwnerScope, orderProjection, orderUpdatedAt, payment, quantities, refund, restockOrderLines, returnRequest } from "./mysql-helpers.repository"
import { type Actor, type ActorScoped, requireCustomerOwner, requireFreshGrant, requireGrant, requireStore } from "@/server/db/actor"
import { withTransaction } from "@/server/db/client"
import { cartLines, carts, orderContacts, orderLines, orderNotes, orderPromotionCodes, orders, payments, promotionRedemptions, promotions, refunds, returns } from "@/server/db/schema"
import { isoDate, jsonValue, sqlDate } from "@/server/db/values"
import { uuidv7 } from "@/server/db/uuid"
import { lockCart, lockLevels, lockStore, releaseCartReservations, releaseExpiredReservations } from "@/server/inventory/mysql.repository"
import type { PromotionCondition } from "@/server/promotions/types"
import { DomainError } from "@/server/shared/errors"

type Writes = Pick<ActorScoped<OrderRepository>, "placeOrder" | "transition" | "recordPayment" | "createRefund" | "createReturn" | "restockReturn" | "decideReturn" | "addNote" | "nextOrderNumber" | "anonymiseCustomer">
const transitionPermission = { pending_payment: "orders:write", confirmed: "orders:mark_paid", processing: "orders:fulfil", shipped: "orders:fulfil", delivered: "orders:fulfil", cancelled: "orders:cancel", returned: "orders:returns" } as const

function actorLabel(actor: Actor, label: string) {
  if (actor.kind === "staff" && label !== actor.id) throw new DomainError("forbidden", "Action identity does not match the actor.")
}

export function createMysqlOrderWrites(): Writes {
  return {
    async placeOrder(actor, { draft, cartId, promotionIds, event }) {
      requireStore(actor, draft.storeId)
      if (actor.kind === "customer" && draft.customerId !== actor.id || actor.kind === "anonymous" && draft.customerId !== null) throw new DomainError("forbidden", "Order identity does not match the shopper.")
      if (!draft.idempotencyKey || !draft.lines.length || !["confirmed", "pending_payment"].includes(draft.status)) throw new DomainError("validation", "The order is incomplete.")
      return withTransaction(async (db) => {
        await lockStore(db, actor)
        const replay = await db.select(orderProjection(actor)).from(orders).where(and(eq(orders.storeId, actor.storeId), eq(orders.idempotencyKey, draft.idempotencyKey), orderOwnerScope(db, actor))).limit(1)
        if (replay.length) return { order: (await hydrateOrders(db, replay))[0], replayed: true }
        const cart = await lockCart(db, actor, cartId)
        if (cart.status !== "active") throw new DomainError("conflict", "This bag has already been checked out.")
        if (cart.customerId !== draft.customerId) throw new DomainError("forbidden", "Order identity does not match the bag.")
        const cartRows = await db.select().from(cartLines).where(eq(cartLines.cartId, cart.id)).orderBy(asc(cartLines.variantId)).for("update")
        const quantitiesByVariant = new Map<string, number>()
        for (const line of draft.lines) {
          if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new DomainError("validation", "Invalid order quantity.")
          quantitiesByVariant.set(line.variantId, (quantitiesByVariant.get(line.variantId) ?? 0) + line.quantity)
        }
        if (cartRows.length !== quantitiesByVariant.size || cartRows.some((line) => quantitiesByVariant.get(line.variantId) !== line.quantity)) throw new DomainError("conflict", "Your bag changed. Review it before placing your order.")
        await releaseExpiredReservations(db, actor)
        await releaseCartReservations(db, actor, cart.id)
        const levels = await lockLevels(db, actor, [...quantitiesByVariant.keys()])
        for (const [variantId, quantity] of [...quantitiesByVariant].sort(([a], [b]) => a.localeCompare(b))) {
          const level = levels.find((row) => row.variantId === variantId), line = draft.lines.find((row) => row.variantId === variantId)!
          if (!level || level.onHand - level.reserved < quantity) throw new DomainError("out_of_stock", line.title + " (EU " + line.size.eu + ") is no longer available in that quantity.", { variantId })
          const { inventoryLevels } = await import("@/server/db/schema")
          await db.update(inventoryLevels).set({ onHand: level.onHand - quantity }).where(eq(inventoryLevels.variantId, variantId))
        }
        const selected = [...new Set(promotionIds)].sort()
        const coupons = selected.length ? await db.select().from(promotions).where(and(eq(promotions.storeId, actor.storeId), inArray(promotions.id, selected))).orderBy(asc(promotions.id)).for("update") : []
        if (coupons.length !== selected.length) throw new DomainError("promotion_invalid", "A discount on your bag is no longer available.")
        const email = draft.email.trim().toLowerCase()
        for (const coupon of coupons) {
          const now = Date.now()
          if (!coupon.active || coupon.startsAt && Date.parse(isoDate(coupon.startsAt)) > now || coupon.endsAt && Date.parse(isoDate(coupon.endsAt)) <= now) throw new DomainError("promotion_invalid", "A discount on your bag is no longer available.")
          if (coupon.usageLimit !== null && coupon.timesUsed >= coupon.usageLimit) throw new DomainError("promotion_invalid", '"' + coupon.title + '" has been fully redeemed.')
          const [used] = await db.select({ count: count() }).from(promotionRedemptions).where(and(eq(promotionRedemptions.promotionId, coupon.id), or(eq(promotionRedemptions.email, email), draft.customerId ? eq(promotionRedemptions.customerId, draft.customerId) : undefined)))
          if (coupon.perCustomerLimit !== null && used.count >= coupon.perCustomerLimit) throw new DomainError("promotion_invalid", 'You have already used "' + coupon.title + '".')
          if (jsonValue<PromotionCondition[]>(coupon.conditions).some((condition) => condition.type === "first_order")) {
            const [prior] = await db.select({ count: count() }).from(orders).where(and(eq(orders.storeId, actor.storeId), ne(orders.status, "cancelled"), or(eq(orders.email, email), draft.customerId ? eq(orders.customerId, draft.customerId) : undefined)))
            if (prior.count > 0) throw new DomainError("promotion_invalid", "This discount is for your first order.")
          }
          await db.update(promotions).set({ timesUsed: coupon.timesUsed + 1 }).where(and(eq(promotions.storeId, actor.storeId), eq(promotions.id, coupon.id)))
        }
        const at = new Date().toISOString(), id = uuidv7(), number = await allocateNumber(db, actor)
        const history: Order["history"] = [{ from: null, to: draft.status, at, actor: "customer" }]
        const { lines, promotionCodes, taxIncluded, ...header } = draft
        await db.insert(orders).values({ ...header, id, number, email, checkoutCartId: cart.id, taxIncluded: taxIncluded ? 1 : 0, history, placedAt: sqlDate(at), updatedAt: sqlDate(at) })
        await db.insert(orderLines).values(lines.map((line, position) => ({ ...line, orderId: id, position })))
        if (promotionCodes.length) await db.insert(orderPromotionCodes).values(promotionCodes.map((value, position) => ({ id, value, position })))
        await db.insert(orderContacts).values({ orderId: id, storeId: actor.storeId, recipientName: draft.shippingAddress.fullName, phoneDigits: draft.phone.replace(/\D/g, "") })
        if (selected.length) await db.insert(promotionRedemptions).values(selected.map((promotionId) => ({ id: uuidv7(), promotionId, orderId: id, customerId: draft.customerId, email })))
        await db.update(carts).set({ status: "converted", updatedAt: sqlDate(at) }).where(and(eq(carts.storeId, actor.storeId), eq(carts.id, cart.id)))
        await enqueueOrderEvent(db, actor, id, event.topic, { ...event.payload, number })
        return { order: { ...structuredClone(draft), email, id, number, history, refundedTotal: 0, placedAt: at, updatedAt: at }, replayed: false }
      }, { retries: 3, idempotencyKey: draft.idempotencyKey })
    },
    async transition(actor, orderId, to, label, note, trackingNumber) {
      actorLabel(actor, label)
      if (actor.kind === "staff" || actor.kind === "system") requireGrant(actor, transitionPermission[to])
      else if (to !== "cancelled") throw new DomainError("forbidden", "You don't have permission to change this order.")
      return withTransaction(async (db) => {
        await lockStore(db, actor)
        const order = await lockedOrder(db, actor, orderId)
        const from = order.status
        if (actor.kind !== "staff" && actor.kind !== "system" && !customerCanCancel(from)) throw new DomainError("invalid_transition", "This order can no longer be cancelled.")
        if (!canTransition(from, to)) throw new DomainError("invalid_transition", "An order that is " + from.replace("_", " ") + " can't become " + to.replace("_", " ") + ".")
        if (restocksOnTransition(from, to)) {
          const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id)).orderBy(asc(orderLines.variantId)).for("update")
          await restockOrderLines(db, actor, order.id, lines.filter((line) => line.quantity > line.restockedQuantity).map((line) => ({ orderLineId: line.id, quantity: line.quantity - line.restockedQuantity })))
        }
        const at = orderUpdatedAt(order.updatedAt)
        const history = [...order.history, { from, to, at: isoDate(at), actor: label, ...(note ? { note } : {}) }]
        const fulfillmentStatus = to === "shipped" || to === "delivered" ? "fulfilled" : to === "returned" ? "returned" : order.fulfillmentStatus
        await db.update(orders).set({ status: to, fulfillmentStatus, history, updatedAt: at, ...(trackingNumber ? { trackingNumber } : {}) }).where(and(eq(orders.storeId, actor.storeId), eq(orders.id, order.id)))
        await auditOrder(db, actor, "order.transition", "order", order.id, { status: from }, { status: to, note })
        await enqueueOrderEvent(db, actor, order.id, "order.status_changed", { number: order.number, from, to, trackingNumber: trackingNumber ?? order.trackingNumber })
        return { ...order, status: to, fulfillmentStatus, history, trackingNumber: trackingNumber ?? order.trackingNumber, updatedAt: isoDate(at) }
      })
    },
    async recordPayment(actor, input) {
      requireGrant(actor, "orders:mark_paid")
      return withTransaction(async (db) => {
        await lockStore(db, actor)
        const order = await lockedOrder(db, actor, input.orderId)
        if (!Number.isSafeInteger(input.amount) || input.amount < 0 || input.currency !== order.currency) throw new DomainError("validation", "Payment amount or currency is invalid.")
        const rows = await db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(asc(payments.id)).for("update")
        let existing = rows.find((row) => row.idempotencyKey === input.idempotencyKey)
        if (existing && existing.status === input.status) return payment(existing)
        if (existing && ["captured", "refunded", "partially_refunded"].includes(existing.status)) return payment(existing)
        if (existing) {
          await db.update(payments).set({ status: input.status, providerRef: input.providerRef ?? existing.providerRef }).where(and(eq(payments.id, existing.id), eq(payments.orderId, order.id)))
          existing = { ...existing, status: input.status, providerRef: input.providerRef ?? existing.providerRef }
        } else {
          existing = { ...input, id: uuidv7(), refundedAmount: 0, createdAt: sqlDate(new Date().toISOString()) }
          await db.insert(payments).values(existing)
          rows.push(existing)
        }
        const current = rows.map((row) => row.id === existing!.id ? existing! : row)
        const captured = current.filter((row) => ["captured", "refunded", "partially_refunded"].includes(row.status)).reduce((sum, row) => sum + row.amount, 0)
        let paymentStatus = order.paymentStatus, status = order.status
        const history = [...order.history], at = orderUpdatedAt(order.updatedAt)
        if (input.status === "failed" && captured === 0) paymentStatus = "failed"
        if (input.status === "authorized" && captured === 0) paymentStatus = "authorized"
        if (captured >= order.total) {
          paymentStatus = order.refundedTotal >= captured ? "refunded" : order.refundedTotal > 0 ? "partially_refunded" : "paid"
          if (status === "pending_payment") {
            status = "confirmed"
            history.push({ from: "pending_payment", to: "confirmed", at: isoDate(at), actor: "payment:" + existing.provider })
            await enqueueOrderEvent(db, actor, order.id, "order.status_changed", { number: order.number, from: "pending_payment", to: "confirmed", trackingNumber: order.trackingNumber })
          }
        }
        await db.update(orders).set({ paymentStatus, status, history, updatedAt: at }).where(and(eq(orders.storeId, actor.storeId), eq(orders.id, order.id)))
        await enqueueOrderEvent(db, actor, order.id, "payment.recorded", { number: order.number, provider: existing.provider, status: existing.status, amount: existing.amount })
        return payment(existing)
      }, { retries: 3, idempotencyKey: input.idempotencyKey })
    },
    async createRefund(actor, input) {
      requireFreshGrant(actor, "orders:refund")
      if (actor.kind === "staff" && actor.refundLimit !== null && input.amount > actor.refundLimit) throw new DomainError("forbidden", "This refund exceeds your role's limit.")
      return withTransaction(async (db) => {
        await lockStore(db, actor)
        const order = await lockedOrder(db, actor, input.orderId)
        const [replay] = await db.select().from(refunds).where(and(eq(refunds.orderId, order.id), eq(refunds.idempotencyKey, input.idempotencyKey))).limit(1)
        if (replay) return refund(replay)
        const paidRows = await db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(asc(payments.id)).for("update")
        const paid = paidRows.filter((row) => ["captured", "partially_refunded", "refunded"].includes(row.status)).reduce((sum, row) => sum + row.amount, 0)
        if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || order.refundedTotal + input.amount > Math.min(paid, order.total)) throw new DomainError("validation", "Refund exceeds the amount paid.")
        const targetPayment = input.paymentId ? paidRows.find((row) => row.id === input.paymentId) : null
        if (input.paymentId && (!targetPayment || targetPayment.refundedAmount + input.amount > targetPayment.amount)) throw new DomainError("validation", "Refund exceeds the amount paid.")
        const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id)).orderBy(asc(orderLines.id)).for("update")
        const items = quantities(input.lines)
        for (const item of items) {
          const line = lines.find((row) => row.id === item.orderLineId)
          if (!line || line.refundedQuantity + item.quantity > line.quantity) throw new DomainError("validation", "Refund quantity exceeds the quantity bought.")
          await db.update(orderLines).set({ refundedQuantity: line.refundedQuantity + item.quantity }).where(and(eq(orderLines.orderId, order.id), eq(orderLines.id, line.id)))
        }
        if (input.restock) await restockOrderLines(db, actor, order.id, items)
        const refundedTotal = order.refundedTotal + input.amount
        await db.update(orders).set({ refundedTotal, paymentStatus: refundedTotal >= paid ? "refunded" : "partially_refunded", updatedAt: orderUpdatedAt(order.updatedAt) }).where(and(eq(orders.storeId, actor.storeId), eq(orders.id, order.id)))
        if (targetPayment) await db.update(payments).set({ refundedAmount: targetPayment.refundedAmount + input.amount, status: targetPayment.refundedAmount + input.amount >= targetPayment.amount ? "refunded" : "partially_refunded" }).where(and(eq(payments.id, targetPayment.id), eq(payments.orderId, order.id)))
        const row = { ...input, lines: items, restock: input.restock ? 1 : 0, id: uuidv7(), createdAt: sqlDate(new Date().toISOString()) }
        await db.insert(refunds).values(row)
        await enqueueOrderEvent(db, actor, order.id, "refund.created", { number: order.number, amount: input.amount })
        return refund(row)
      }, { retries: 3, idempotencyKey: input.idempotencyKey })
    },
    async createReturn(actor, input) {
      if (actor.kind === "staff" || actor.kind === "system") requireGrant(actor, "orders:returns")
      return withTransaction(async (db) => {
        await lockStore(db, actor)
        const order = await lockedOrder(db, actor, input.orderId)
        if (actor.kind !== "staff" && actor.kind !== "system" && !customerCanRequestReturn(order.status, order.history.findLast((entry) => entry.to === "delivered")?.at ?? null)) throw new DomainError("invalid_transition", "Returns can be requested within 7 days of delivery.")
        const [open] = await db.select({ id: returns.id }).from(returns).where(and(eq(returns.orderId, order.id), ne(returns.status, "rejected"))).limit(1)
        if (open) throw new DomainError("conflict", "A return is already open for this order.")
        const items = quantities(input.lines)
        for (const item of items) { const line = order.lines.find((row) => row.id === item.orderLineId); if (!line || item.quantity > line.quantity - line.refundedQuantity) throw new DomainError("validation", "Return quantity exceeds the quantity bought.") }
        const row = { ...input, lines: items, id: uuidv7(), status: "requested", createdAt: sqlDate(new Date().toISOString()) }
        await db.insert(returns).values(row)
        await enqueueOrderEvent(db, actor, order.id, "return.requested", { number: order.number, returnId: row.id })
        return returnRequest(row)
      })
    },
    async restockReturn(actor, returnId, label) {
      requireGrant(actor, "orders:returns"); actorLabel(actor, label)
      return withTransaction(async (db) => {
        await lockStore(db, actor)
        const [row] = await db.select(getTableColumns(returns)).from(returns).innerJoin(orders, eq(orders.id, returns.orderId)).where(and(eq(orders.storeId, actor.storeId), eq(returns.id, returnId))).for("update")
        if (!row) throw new DomainError("not_found", "Return not found.")
        if (row.status === "received") return returnRequest(row)
        if (row.status === "rejected") throw new DomainError("invalid_transition", "A rejected return can't be received.")
        await restockOrderLines(db, actor, row.orderId, jsonValue<ReturnType<typeof quantities>>(row.lines))
        await db.update(returns).set({ status: "received" }).where(and(eq(returns.id, row.id), eq(returns.orderId, row.orderId)))
        await auditOrder(db, actor, "return.restock", "return", row.id, null, row.lines)
        return returnRequest({ ...row, status: "received" })
      }, { retries: 3, idempotencyKey: "receive-return:" + returnId })
    },
    async decideReturn(actor, returnId, decision, label) {
      requireGrant(actor, "orders:returns"); actorLabel(actor, label)
      return withTransaction(async (db) => {
        await lockStore(db, actor)
        const [row] = await db.select(getTableColumns(returns)).from(returns).innerJoin(orders, eq(orders.id, returns.orderId)).where(and(eq(orders.storeId, actor.storeId), eq(returns.id, returnId))).for("update")
        if (!row) throw new DomainError("not_found", "Return not found.")
        if (row.status !== "requested") throw new DomainError("invalid_transition", "A return that is " + row.status + " can't be " + decision + ".")
        await db.update(returns).set({ status: decision }).where(and(eq(returns.id, row.id), eq(returns.orderId, row.orderId)))
        return returnRequest({ ...row, status: decision })
      })
    },
    async addNote(actor, input) {
      requireGrant(actor, "orders:write")
      if (actor.kind === "staff" && input.author !== actor.id) throw new DomainError("forbidden", "Note author does not match the actor.")
      return withTransaction(async (db) => {
        await lockStore(db, actor)
        await lockedOrder(db, actor, input.orderId)
        const at = new Date().toISOString(), id = uuidv7()
        await db.insert(orderNotes).values({ ...input, id, createdAt: sqlDate(at) })
        return { ...input, id, createdAt: at }
      })
    },
    async nextOrderNumber(actor, storeId) {
      requireStore(actor, storeId); requireGrant(actor, "orders:write")
      return withTransaction(async (db) => { await lockStore(db, actor); return allocateNumber(db, actor) })
    },
    async anonymiseCustomer(actor, customerId) {
      requireCustomerOwner(actor, customerId, "customers:delete")
      if (actor.kind === "staff") requireFreshGrant(actor, "customers:delete")
      return withTransaction(async (db) => {
        await lockStore(db, actor)
        const rows = await db.select().from(orders).where(and(eq(orders.storeId, actor.storeId), eq(orders.customerId, customerId))).orderBy(asc(orders.id)).for("update")
        for (const row of rows) {
          const address = jsonValue<Order["shippingAddress"]>(row.shippingAddress)
          await db.update(orders).set({ email: "deleted+" + row.id.slice(0, 8) + "@invalid", phone: "", customerId: null, shippingAddress: { fullName: "Deleted customer", phone: "", line1: "", city: address.city, province: address.province, country: address.country } }).where(and(eq(orders.storeId, actor.storeId), eq(orders.id, row.id)))
          await db.update(orderContacts).set({ recipientName: "Deleted customer", phoneDigits: "" }).where(and(eq(orderContacts.storeId, actor.storeId), eq(orderContacts.orderId, row.id)))
        }
        return rows.length
      })
    },
  }
}
