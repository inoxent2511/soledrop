import "server-only"

import type { Permission } from "@/server/admin/permissions"
import type { RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import { toCsv } from "@/server/import-export/csv"
import { ORDER_STATUS_LABEL, ORDER_TRANSITIONS } from "@/server/orders/state-machine"
import type { OrderService } from "@/server/orders/service"
import type { Address, Order, OrderQuery, OrderStatus, Payment, Refund, ReturnRequest } from "@/server/orders/types"
import { DomainError } from "@/server/shared/errors"

/**
 * Staff operations on orders (admin A2). Every action checks the member's permission, goes through
 * the order service (same state machine, stock ledger, events and RPCs as the storefront and
 * /api/v1), and writes an admin audit entry. Customer contact details are masked for staff
 * without `customers:read_pii`.
 */

type Audit = (staff: StaffContext, meta: RequestMeta, entry: { action: string; entity: string; entityId: string; before?: unknown; after?: unknown; reason?: string | null; storeId: string }) => Promise<void>

type Deps = { orders: OrderService; audit: Audit; assertSteppedUp: (staff: StaffContext) => void }

/** Which permission moves an order to each status. */
export const TRANSITION_PERMISSION: Record<OrderStatus, Permission> = {
  pending_payment: "orders:write",
  confirmed: "orders:mark_paid",
  processing: "orders:fulfil",
  shipped: "orders:fulfil",
  delivered: "orders:fulfil",
  cancelled: "orders:cancel",
  returned: "orders:returns",
}

const need = (staff: StaffContext, permission: Permission) => {
  if (!staff.permissions.includes(permission)) throw new DomainError("forbidden", "You don't have permission to do that.", { permission })
}

const maskEmail = (email: string) => {
  const [name, domain] = email.split("@")
  return domain ? `${name.slice(0, 1)}•••@${domain}` : "•••"
}
const maskPhone = (phone: string) => (phone ? `•••${phone.replace(/\D/g, "").slice(-3)}` : "")
const maskAddress = (address: Address): Address => ({ ...address, fullName: address.fullName.split(" ")[0] ?? "", phone: maskPhone(address.phone), line1: "•••", line2: address.line2 ? "•••" : undefined, postalCode: address.postalCode ? "•••" : undefined })

export type StaffOrderSummary = {
  id: string
  number: string
  placedAt: string
  customer: string
  email: string
  status: OrderStatus
  paymentStatus: Order["paymentStatus"]
  fulfillmentStatus: Order["fulfillmentStatus"]
  paymentMethod: string
  items: number
  total: number
  currency: Order["currency"]
}

export type StaffOrderDetail = {
  order: Order
  payments: Payment[]
  refunds: Refund[]
  returns: ReturnRequest[]
  notes: { id: string; authorName: string; body: string; createdAt: string }[]
  /** What this staff member may do next, so the UI offers only those actions (the server re-checks). */
  actions: { transitions: OrderStatus[]; markPaid: boolean; refund: boolean; refundable: number; refundLimit: number | null; returns: boolean; note: boolean }
  piiMasked: boolean
}

function visible(order: Order, staff: StaffContext): Order {
  if (staff.permissions.includes("customers:read_pii")) return order
  return { ...order, email: maskEmail(order.email), phone: maskPhone(order.phone), shippingAddress: maskAddress(order.shippingAddress) }
}

const summary = (order: Order): StaffOrderSummary => ({
  id: order.id,
  number: order.number,
  placedAt: order.placedAt,
  customer: order.shippingAddress.fullName,
  email: order.email,
  status: order.status,
  paymentStatus: order.paymentStatus,
  fulfillmentStatus: order.fulfillmentStatus,
  paymentMethod: order.paymentMethod,
  items: order.lines.reduce((count, line) => count + line.quantity, 0),
  total: order.total,
  currency: order.currency,
})

const paidAmount = (payments: Payment[]) => payments.filter((payment) => payment.status === "captured" || payment.status === "partially_refunded" || payment.status === "refunded").reduce((total, payment) => total + payment.amount, 0)

export function createStaffOrders(deps: Deps) {
  const { orders } = deps

  async function load(staff: StaffContext, number: string): Promise<Order> {
    const order = await orders.lookupByNumber(staff.member.storeId, number)
    if (!order) throw new DomainError("not_found", "Order not found.")
    return order
  }

  return {
    async list(staff: StaffContext, query: OrderQuery) {
      need(staff, "orders:read")
      const page = await orders.search(staff.member.storeId, query)
      return { orders: page.orders.map((order) => summary(visible(order, staff))), total: page.total }
    },

    async detail(staff: StaffContext, number: string): Promise<StaffOrderDetail> {
      need(staff, "orders:read")
      const order = await load(staff, number)
      const [payments, refunds, returns, notes] = await Promise.all([orders.listPayments(order.id), orders.listRefunds(order.id), orders.listReturns(order.id), orders.listNotes(order.id)])
      const refundable = Math.max(0, paidAmount(payments) - order.refundedTotal)
      const can = (permission: Permission) => staff.permissions.includes(permission)
      return {
        order: visible(order, staff),
        payments,
        refunds,
        returns,
        notes: notes.map((note) => ({ id: note.id, authorName: note.authorName, body: note.body, createdAt: note.createdAt })),
        actions: {
          transitions: ORDER_TRANSITIONS[order.status].filter((to) => can(TRANSITION_PERMISSION[to])),
          markPaid: can("orders:mark_paid") && order.paymentStatus !== "paid" && order.paymentStatus !== "refunded" && order.paymentStatus !== "partially_refunded" && order.status !== "cancelled",
          refund: can("orders:refund") && refundable > 0,
          refundable,
          refundLimit: staff.refundLimit,
          returns: can("orders:returns"),
          note: can("orders:write"),
        },
        piiMasked: !can("customers:read_pii"),
      }
    },

    async transition(staff: StaffContext, meta: RequestMeta, number: string, input: { to: OrderStatus; note?: string; trackingNumber?: string; reason?: string | null; expectedUpdatedAt?: string }) {
      need(staff, TRANSITION_PERMISSION[input.to])
      const order = await load(staff, number)
      if (input.expectedUpdatedAt && order.updatedAt !== input.expectedUpdatedAt) throw new DomainError("conflict", "This order changed since you opened it. Reload to see the latest.")
      if (input.to === "cancelled" && !input.reason?.trim()) throw new DomainError("validation", "Give a reason for cancelling.", { fields: { reason: ["Give a reason for cancelling."] } })
      if (input.to === "shipped" && !input.trackingNumber?.trim() && !order.trackingNumber) throw new DomainError("validation", "Add the courier tracking number.", { fields: { trackingNumber: ["Add the courier tracking number."] } })
      const note = [input.note?.trim(), input.reason?.trim()].filter(Boolean).join(" — ") || undefined
      const updated = await orders.transition(order.id, input.to, `staff:${staff.member.userId}`, note, input.trackingNumber?.trim() || undefined)
      await deps.audit(staff, meta, { action: `order.${input.to}`, entity: "order", entityId: order.number, before: { status: order.status }, after: { status: updated.status, trackingNumber: updated.trackingNumber }, reason: input.reason ?? null, storeId: staff.member.storeId })
      return updated
    },

    /** Records an offline payment (cash collected by the courier, a bank transfer on the statement). */
    async markPaid(staff: StaffContext, meta: RequestMeta, number: string, input: { provider: "cod" | "bank_transfer"; amount: number; reference?: string; idempotencyKey: string }) {
      need(staff, "orders:mark_paid")
      const order = await load(staff, number)
      if (order.status === "cancelled") throw new DomainError("invalid_transition", "A cancelled order can't be paid.")
      const payment = await orders.recordPayment({ orderId: order.id, provider: input.provider, status: "captured", amount: input.amount, currency: order.currency, providerRef: input.reference?.trim() || null, idempotencyKey: `admin:${input.idempotencyKey}` })
      await deps.audit(staff, meta, { action: "order.payment_recorded", entity: "order", entityId: order.number, after: { provider: input.provider, amount: input.amount, reference: input.reference ?? null }, storeId: staff.member.storeId })
      return payment
    },

    /** Refunds within the member's ceiling, after a fresh second factor (A-003). */
    async refund(staff: StaffContext, meta: RequestMeta, number: string, input: { amount: number; reason: string; lines: { orderLineId: string; quantity: number }[]; restock: boolean; idempotencyKey: string }) {
      need(staff, "orders:refund")
      deps.assertSteppedUp(staff)
      if (staff.refundLimit !== null && input.amount > staff.refundLimit) {
        throw new DomainError("forbidden", "This refund is above your limit. Ask someone with a higher limit.", { refundLimit: staff.refundLimit })
      }
      const order = await load(staff, number)
      const refund = await orders.refund({ ...input, orderId: order.id, idempotencyKey: `admin:${input.idempotencyKey}` })
      await deps.audit(staff, meta, { action: "order.refunded", entity: "order", entityId: order.number, after: { amount: input.amount, lines: input.lines, restock: input.restock }, reason: input.reason, storeId: staff.member.storeId })
      return refund
    },

    async decideReturn(staff: StaffContext, meta: RequestMeta, number: string, returnId: string, decision: "approved" | "rejected" | "received", reason: string | null) {
      need(staff, "orders:returns")
      const order = await load(staff, number)
      if (!(await orders.listReturns(order.id)).some((request) => request.id === returnId)) throw new DomainError("not_found", "Return not found.")
      const actor = `staff:${staff.member.userId}`
      const result = decision === "received" ? await orders.restockReturn(returnId, actor) : await orders.decideReturn(returnId, decision, actor)
      await deps.audit(staff, meta, { action: `return.${decision}`, entity: "order", entityId: order.number, after: { returnId, status: result.status }, reason, storeId: staff.member.storeId })
      return result
    },

    async addNote(staff: StaffContext, meta: RequestMeta, number: string, body: string) {
      need(staff, "orders:write")
      const order = await load(staff, number)
      const note = await orders.addNote({ orderId: order.id, author: staff.member.userId, authorName: staff.member.displayName || staff.member.email, body: body.trim() })
      await deps.audit(staff, meta, { action: "order.note_added", entity: "order", entityId: order.number, after: { noteId: note.id }, storeId: staff.member.storeId })
      return note
    },

    // ─── Payments (admin A6) ─────────────────────────────────────────────────
    /** Providers, the bank-transfer queue (oldest first) and today's takings. */
    async paymentsOverview(staff: StaffContext) {
      need(staff, "payments:read")
      const storeId = staff.member.storeId
      const [providers, queue, today] = await Promise.all([
        orders.providers(),
        orders.search(storeId, { status: ["pending_payment"], paymentMethod: "bank_transfer", sort: "placed_asc", page: 1, pageSize: 100 }),
        orders.ledger(storeId, { kind: "payments", page: 1, pageSize: 500 }),
      ])
      const startOfDay = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }) + "T00:00:00+05:00").toISOString()
      const captured = today.rows.filter((row) => row.status === "captured" && row.at >= startOfDay)
      return {
        providers,
        queue: queue.orders.map((order) => ({ ...summary(visible(order, staff)), waitingHours: Math.floor((Date.now() - Date.parse(order.placedAt)) / 3_600_000) })),
        today: { count: captured.length, amount: captured.reduce((sum, row) => sum + row.amount, 0) },
      }
    },

    async ledger(staff: StaffContext, query: { kind: "payments" | "refunds"; provider?: string; page: number; pageSize: number }) {
      need(staff, "payments:read")
      return orders.ledger(staff.member.storeId, query)
    },

    /** A bank transfer seen on the statement: records it against the order (confirms it when paid in full). */
    async reconcile(staff: StaffContext, meta: RequestMeta, number: string, input: { amount: number; reference: string; idempotencyKey: string }) {
      need(staff, "payments:reconcile")
      const order = await load(staff, number)
      if (order.paymentMethod !== "bank_transfer") throw new DomainError("validation", "Only bank-transfer orders are reconciled here.")
      const payment = await orders.recordPayment({ orderId: order.id, provider: "bank_transfer", status: "captured", amount: input.amount, currency: order.currency, providerRef: input.reference.trim(), idempotencyKey: `admin:${input.idempotencyKey}` })
      await deps.audit(staff, meta, { action: "payment.reconciled", entity: "order", entityId: order.number, after: { amount: input.amount, reference: input.reference }, storeId: staff.member.storeId })
      return payment
    },

    /** CSV of every order matching the filters (up to 5,000 rows), formula-safe (CSV injection). */
    async exportCsv(staff: StaffContext, meta: RequestMeta, query: Omit<OrderQuery, "page" | "pageSize">) {
      need(staff, "orders:export")
      const page = await orders.search(staff.member.storeId, { ...query, page: 1, pageSize: 5000 })
      const rows = page.orders.map((order) => {
        const shown = visible(order, staff)
        return {
          number: shown.number,
          placed_at: shown.placedAt,
          status: ORDER_STATUS_LABEL[shown.status],
          payment_status: shown.paymentStatus,
          payment_method: shown.paymentMethod,
          customer: shown.shippingAddress.fullName,
          email: shown.email,
          phone: shown.phone,
          city: shown.shippingAddress.city,
          items: shown.lines.reduce((count, line) => count + line.quantity, 0),
          total: (shown.total / 100).toFixed(2),
          refunded: (shown.refundedTotal / 100).toFixed(2),
          currency: shown.currency,
          tracking_number: shown.trackingNumber,
        }
      })
      await deps.audit(staff, meta, { action: "order.exported", entity: "order", entityId: "*", after: { rows: rows.length, filters: query }, storeId: staff.member.storeId })
      return toCsv(["number", "placed_at", "status", "payment_status", "payment_method", "customer", "email", "phone", "city", "items", "total", "refunded", "currency", "tracking_number"], rows)
    },
  }
}

export type StaffOrders = ReturnType<typeof createStaffOrders>
