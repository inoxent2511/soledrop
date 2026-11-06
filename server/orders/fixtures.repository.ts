import "server-only"

import { db, transaction } from "@/server/fixtures/store"
import type { FixtureTables } from "@/server/fixtures/tables"
import { assertInventoryInvariants, releaseCartIn, releaseExpiredIn } from "@/server/inventory/fixtures.repository"
import type { OrderRepository } from "@/server/orders/repository"
import { canTransition, restocksOnTransition } from "@/server/orders/state-machine"
import type { Order, OrderQuery, Payment } from "@/server/orders/types"
import type { EventTopic } from "@/server/platform/types"
import { DomainError } from "@/server/shared/errors"
import { newId, now } from "@/server/shared/ids"

function nextNumberIn(tables: FixtureTables): string {
  const number = `${tables.orderSequence.prefix}${tables.orderSequence.next}`
  tables.orderSequence.next += 1
  return number
}

function enqueueIn(tables: FixtureTables, topic: EventTopic, payload: Record<string, unknown>) {
  tables.outbox.push({ id: newId(), topic, payload, status: "pending", attempts: 0, availableAt: now(), createdAt: now(), lastError: null })
}

function restockLines(tables: FixtureTables, lines: { variantId: string; quantity: number }[]) {
  for (const line of lines) {
    const level = tables.inventory.find((row) => row.variantId === line.variantId)
    if (level) level.onHand += line.quantity
  }
}

const statusEvent = (order: Order, from: string, trackingNumber?: string) => ({
  orderId: order.id,
  number: order.number,
  email: order.email,
  from,
  to: order.status,
  trackingNumber: trackingNumber ?? order.trackingNumber,
})

/** Staff search over the fixture orders, mirroring the Postgres query in the supabase repository. */
function matches(order: Order, query: OrderQuery): boolean {
  const q = query.q?.trim().toLowerCase()
  if (q) {
    const digits = q.replace(/\D/g, "")
    const haystack = [order.number, order.email, order.shippingAddress.fullName, order.phone].map((value) => value.toLowerCase())
    if (!haystack.some((value) => value.includes(q)) && !(digits.length >= 4 && order.phone.replace(/\D/g, "").includes(digits))) return false
  }
  if (query.status?.length && !query.status.includes(order.status)) return false
  if (query.paymentStatus?.length && !query.paymentStatus.includes(order.paymentStatus)) return false
  if (query.paymentMethod && order.paymentMethod !== query.paymentMethod) return false
  if (query.placedFrom && order.placedAt < query.placedFrom) return false
  if (query.placedTo && order.placedAt >= query.placedTo) return false
  return true
}

const SORTERS: Record<NonNullable<OrderQuery["sort"]>, (a: Order, b: Order) => number> = {
  placed_desc: (a, b) => b.placedAt.localeCompare(a.placedAt),
  placed_asc: (a, b) => a.placedAt.localeCompare(b.placedAt),
  total_desc: (a, b) => b.total - a.total || b.placedAt.localeCompare(a.placedAt),
  total_asc: (a, b) => a.total - b.total || b.placedAt.localeCompare(a.placedAt),
}

export function createFixturesOrderRepository(): OrderRepository {
  return {
    async placeOrder({ draft, cartId, promotionIds, event }) {
      return transaction((tables) => {
        const replay = tables.orders.find((order) => order.storeId === draft.storeId && order.idempotencyKey === draft.idempotencyKey)
        if (replay) return { order: structuredClone(replay), replayed: true }

        const cart = tables.carts.find((row) => row.id === cartId)
        if (!cart || cart.status !== "active") throw new DomainError("conflict", "This bag has already been checked out.")

        // The cart's own holds are released first, so its units count as free stock for this order.
        releaseExpiredIn(tables)
        releaseCartIn(tables, cartId)
        for (const line of draft.lines) {
          const level = tables.inventory.find((row) => row.variantId === line.variantId)
          if (!level || level.onHand - level.reserved < line.quantity) {
            throw new DomainError("out_of_stock", `${line.title} (EU ${line.size.eu}) is no longer available in that quantity.`, { variantId: line.variantId })
          }
          level.onHand -= line.quantity
        }
        assertInventoryInvariants(tables)

        for (const promotionId of promotionIds) {
          const promotion = tables.promotions.find((row) => row.id === promotionId)
          if (!promotion || !promotion.active) throw new DomainError("promotion_invalid", "A discount on your bag is no longer available.")
          if (promotion.usageLimit !== null && promotion.timesUsed >= promotion.usageLimit) {
            throw new DomainError("promotion_invalid", `"${promotion.title}" has been fully redeemed.`)
          }
          const email = draft.email.toLowerCase()
          const used = tables.promotionRedemptions.filter((row) => row.promotionId === promotionId && row.email === email).length
          if (promotion.perCustomerLimit !== null && used >= promotion.perCustomerLimit) {
            throw new DomainError("promotion_invalid", `You have already used "${promotion.title}".`)
          }
          promotion.timesUsed += 1
        }

        const timestamp = now()
        const order: Order = {
          ...draft,
          id: newId(),
          number: nextNumberIn(tables),
          refundedTotal: 0,
          history: [{ from: null, to: draft.status, at: timestamp, actor: "customer" }],
          placedAt: timestamp,
          updatedAt: timestamp,
        }
        tables.orders.push(order)
        for (const promotionId of promotionIds) {
          tables.promotionRedemptions.push({ promotionId, orderId: order.id, email: order.email.toLowerCase(), at: timestamp })
        }
        cart.status = "converted"
        cart.updatedAt = timestamp
        enqueueIn(tables, event.topic, { ...event.payload, orderId: order.id, number: order.number })
        return { order: structuredClone(order), replayed: false }
      })
    },

    async findByNumber(storeId, number) {
      return structuredClone(db().orders.find((order) => order.storeId === storeId && order.number === number) ?? null)
    },
    async findById(id) {
      return structuredClone(db().orders.find((order) => order.id === id) ?? null)
    },
    async findByIdempotencyKey(storeId, key) {
      return structuredClone(db().orders.find((order) => order.storeId === storeId && order.idempotencyKey === key) ?? null)
    },
    async listByCustomer(storeId, customerId) {
      return structuredClone(db().orders.filter((order) => order.storeId === storeId && order.customerId === customerId).sort((a, b) => b.placedAt.localeCompare(a.placedAt)))
    },
    async listByEmail(storeId, email) {
      return structuredClone(db().orders.filter((order) => order.storeId === storeId && order.email.toLowerCase() === email.toLowerCase()))
    },

    async transition(orderId, to, actor, note, trackingNumber) {
      return transaction((tables) => {
        const order = tables.orders.find((row) => row.id === orderId)
        if (!order) throw new DomainError("not_found", "Order not found.")
        const from = order.status
        if (!canTransition(from, to)) throw new DomainError("invalid_transition", `An order that is ${from.replace("_", " ")} can't become ${to.replace("_", " ")}.`)
        if (restocksOnTransition(from, to)) restockLines(tables, order.lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity - line.refundedQuantity })))
        order.status = to
        if (to === "shipped" || to === "delivered") order.fulfillmentStatus = "fulfilled"
        if (to === "returned") order.fulfillmentStatus = "returned"
        if (trackingNumber) order.trackingNumber = trackingNumber
        order.updatedAt = now()
        order.history.push({ from, to, at: order.updatedAt, actor, note })
        tables.audit.push({ id: newId(), actor, action: "order.transition", entity: "order", entityId: order.id, before: { status: from }, after: { status: to, note }, at: order.updatedAt })
        enqueueIn(tables, "order.status_changed", statusEvent(order, from, trackingNumber))
        return structuredClone(order)
      })
    },

    async recordPayment(input) {
      return transaction((tables) => {
        const existing = tables.payments.find((payment) => payment.orderId === input.orderId && payment.idempotencyKey === input.idempotencyKey)
        // A replayed webhook only advances the status; amounts are fixed at first record.
        if (existing && existing.status !== input.status) {
          existing.status = input.status
          existing.providerRef = input.providerRef ?? existing.providerRef
        }
        const order = tables.orders.find((row) => row.id === input.orderId)
        if (!order) throw new DomainError("not_found", "Order not found.")
        if (input.amount < 0) throw new DomainError("validation", "Payment amount must be positive.")
        const payment: Payment = existing ?? { ...input, id: newId(), refundedAmount: 0, createdAt: now() }
        if (!existing) tables.payments.push(payment)
        const captured = tables.payments.filter((row) => row.orderId === order.id && row.status === "captured").reduce((total, row) => total + row.amount, 0)
        if (input.status === "failed" && captured === 0) order.paymentStatus = "failed"
        if (input.status === "authorized") order.paymentStatus = "authorized"
        if (captured >= order.total) {
          order.paymentStatus = "paid"
          if (order.status === "pending_payment") {
            order.status = "confirmed"
            order.history.push({ from: "pending_payment", to: "confirmed", at: now(), actor: `payment:${payment.provider}` })
            enqueueIn(tables, "order.status_changed", statusEvent(order, "pending_payment"))
          }
        }
        order.updatedAt = now()
        enqueueIn(tables, "payment.recorded", { orderId: order.id, number: order.number, provider: payment.provider, status: payment.status, amount: payment.amount })
        return structuredClone(payment)
      })
    },
    async listPayments(orderId) {
      return structuredClone(db().payments.filter((payment) => payment.orderId === orderId))
    },

    async createRefund(input) {
      return transaction((tables) => {
        const replay = tables.refunds.find((refund) => refund.orderId === input.orderId && refund.idempotencyKey === input.idempotencyKey)
        if (replay) return structuredClone(replay)
        const order = tables.orders.find((row) => row.id === input.orderId)
        if (!order) throw new DomainError("not_found", "Order not found.")
        const paid = tables.payments.filter((row) => row.orderId === order.id && row.status !== "failed" && row.status !== "pending").reduce((total, row) => total + row.amount, 0)
        if (input.amount <= 0 || order.refundedTotal + input.amount > paid) throw new DomainError("validation", "Refund exceeds the amount paid.")
        for (const item of input.lines) {
          const line = order.lines.find((row) => row.id === item.orderLineId)
          if (!line || item.quantity <= 0 || line.refundedQuantity + item.quantity > line.quantity) throw new DomainError("validation", "Refund quantity exceeds the quantity bought.")
          line.refundedQuantity += item.quantity
        }
        if (input.restock) restockLines(tables, input.lines.map((item) => ({ variantId: order.lines.find((line) => line.id === item.orderLineId)!.variantId, quantity: item.quantity })))
        order.refundedTotal += input.amount
        order.paymentStatus = order.refundedTotal >= paid ? "refunded" : "partially_refunded"
        const payment = input.paymentId ? tables.payments.find((row) => row.id === input.paymentId) : undefined
        if (payment) {
          payment.refundedAmount += input.amount
          payment.status = payment.refundedAmount >= payment.amount ? "refunded" : "partially_refunded"
        }
        const refund = { ...input, id: newId(), createdAt: now() }
        tables.refunds.push(refund)
        order.updatedAt = now()
        enqueueIn(tables, "refund.created", { orderId: order.id, number: order.number, email: order.email, amount: input.amount })
        return structuredClone(refund)
      })
    },

    async createReturn(input) {
      return transaction((tables) => {
        const order = tables.orders.find((row) => row.id === input.orderId)
        if (!order) throw new DomainError("not_found", "Order not found.")
        if (tables.returns.some((row) => row.orderId === order.id && row.status !== "rejected")) throw new DomainError("conflict", "A return is already open for this order.")
        for (const item of input.lines) {
          const line = order.lines.find((row) => row.id === item.orderLineId)
          if (!line || item.quantity <= 0 || item.quantity > line.quantity - line.refundedQuantity) throw new DomainError("validation", "Return quantity exceeds the quantity bought.")
        }
        const request = { ...input, id: newId(), status: "requested" as const, createdAt: now() }
        tables.returns.push(request)
        enqueueIn(tables, "return.requested", { orderId: order.id, number: order.number, email: order.email, returnId: request.id })
        return structuredClone(request)
      })
    },
    async restockReturn(returnId, actor) {
      return transaction((tables) => {
        const request = tables.returns.find((row) => row.id === returnId)
        if (!request) throw new DomainError("not_found", "Return not found.")
        if (request.status === "received") return structuredClone(request)
        if (request.status === "rejected") throw new DomainError("invalid_transition", "A rejected return can't be received.")
        const order = tables.orders.find((row) => row.id === request.orderId)!
        restockLines(tables, request.lines.map((item) => ({ variantId: order.lines.find((line) => line.id === item.orderLineId)!.variantId, quantity: item.quantity })))
        request.status = "received"
        tables.audit.push({ id: newId(), actor, action: "return.restock", entity: "return", entityId: request.id, before: null, after: request.lines, at: now() })
        return structuredClone(request)
      })
    },
    async listReturns(orderId) {
      return structuredClone(db().returns.filter((row) => row.orderId === orderId))
    },
    async search(storeId, query) {
      const found = db().orders.filter((order) => order.storeId === storeId && matches(order, query)).sort(SORTERS[query.sort ?? "placed_desc"])
      const start = (query.page - 1) * query.pageSize
      return { orders: structuredClone(found.slice(start, start + query.pageSize)), total: found.length }
    },
    async listRefunds(orderId) {
      return structuredClone(db().refunds.filter((row) => row.orderId === orderId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
    },
    async decideReturn(returnId, decision) {
      return transaction((tables) => {
        const request = tables.returns.find((row) => row.id === returnId)
        if (!request) throw new DomainError("not_found", "Return not found.")
        if (request.status !== "requested") throw new DomainError("invalid_transition", `A return that is ${request.status} can't be ${decision}.`)
        request.status = decision
        return structuredClone(request)
      })
    },
    async addNote(input) {
      return transaction((tables) => {
        if (!tables.orders.some((order) => order.id === input.orderId)) throw new DomainError("not_found", "Order not found.")
        const note = { ...input, id: newId(), createdAt: now() }
        tables.orderNotes.push(note)
        return structuredClone(note)
      })
    },
    async listNotes(orderId) {
      return structuredClone(db().orderNotes.filter((note) => note.orderId === orderId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
    },
    async nextOrderNumber() {
      return transaction((tables) => nextNumberIn(tables))
    },
    async anonymiseCustomer(customerId) {
      return transaction((tables) => {
        const orders = tables.orders.filter((order) => order.customerId === customerId)
        for (const order of orders) {
          order.email = `deleted+${order.id.slice(0, 8)}@invalid`
          order.phone = ""
          order.shippingAddress = { fullName: "Deleted customer", phone: "", line1: "", city: order.shippingAddress.city, province: order.shippingAddress.province, country: order.shippingAddress.country }
          order.customerId = null
        }
        return orders.length
      })
    },
  }
}
