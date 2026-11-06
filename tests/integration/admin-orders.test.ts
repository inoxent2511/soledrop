import { beforeEach, describe, expect, it } from "vitest"

import { parseCsv } from "@/server/import-export/csv"
import { PRESET_ROLES } from "@/server/admin/permissions"
import { resolvePermissions, type RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import { cartService } from "@/server/cart"
import { STORE_ID } from "@/server/fixtures/seed"
import { db, resetFixtures } from "@/server/fixtures/store"
import { orderService } from "@/server/orders"
import { createStaffOrders } from "@/server/orders/staff"
import { DomainError } from "@/server/shared/errors"

/** Staff order operations (admin A2) on the fixtures driver, through the real order service. */

const meta: RequestMeta = { ip: "203.0.113.9", userAgent: "vitest", requestId: "req" }
let audits: { action: string; reason?: string | null; entityId: string }[] = []

function staffAs(roleKey: string, { steppedUp = true } = {}): StaffContext {
  const role = PRESET_ROLES.find((preset) => preset.key === roleKey)!
  const { permissions, refundLimit } = resolvePermissions([{ permissions: [...role.permissions], refundLimit: role.refundLimit }])
  return {
    member: { userId: `user-${roleKey}`, storeId: STORE_ID, email: `${roleKey}@example.com`, displayName: role.name, status: "active", totpEnabledAt: "2026-01-01T00:00:00Z" },
    session: { id: `session-${roleKey}`, aal: 2, mfaAt: steppedUp ? new Date().toISOString() : "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z" },
    roles: [{ id: roleKey, key: roleKey, name: role.name, refundLimit: role.refundLimit }],
    permissions,
    refundLimit,
  }
}

const staff = createStaffOrders({
  orders: orderService(),
  audit: async (_staff, _meta, entry) => void audits.push(entry),
  assertSteppedUp: (member) => {
    if (!member.session.mfaAt || Date.parse(member.session.mfaAt) + 600_000 < Date.now()) throw new DomainError("forbidden", "Step up", { stepUp: true })
  },
})

async function placeOrder({ email = "ayesha@example.com", fullName = "Ayesha Khan", paymentMethod = "cod", key = crypto.randomUUID() } = {}) {
  const level = db().inventory.find((row) => row.onHand >= 1)!
  const carts = cartService()
  const shopper = { storeId: STORE_ID, customerId: null, customerGroup: null, email: null }
  const { row } = await carts.create(STORE_ID, null)
  const cart = await carts.addLine(row, level.variantId, 1, shopper)
  const { order, accessToken } = await orderService().checkout({
    cart,
    shopper: { ...shopper, email },
    email,
    phone: "03001234567",
    address: { fullName, phone: "03001234567", line1: "House 12, Street 4, F-7/2", city: "Islamabad", province: "Islamabad Capital Territory", country: "PK" },
    shippingCode: "standard",
    paymentMethod,
    idempotencyKey: key,
    orderUrl: (number) => `http://localhost/orders/${number}`,
  })
  return Object.assign(order, { accessToken })
}

beforeEach(() => {
  resetFixtures()
  audits = []
})

describe("staff orders", () => {
  it("lists and searches orders, and masks contact details without customers:read_pii", async () => {
    const first = await placeOrder({ email: "ayesha@example.com" })
    await placeOrder({ email: "bilal@example.com", fullName: "Bilal Ahmed" })
    const support = staffAs("support_agent")
    expect((await staff.list(support, { page: 1, pageSize: 25 })).total).toBe(2)
    expect((await staff.list(support, { q: "bilal", page: 1, pageSize: 25 })).orders.map((order) => order.customer)).toEqual(["Bilal Ahmed"])
    expect((await staff.list(support, { q: first.number.toLowerCase(), page: 1, pageSize: 25 })).orders).toHaveLength(1)
    expect((await staff.list(support, { status: ["shipped"], page: 1, pageSize: 25 })).total).toBe(0)
    // Phone digits match however the number was typed.
    expect((await staff.list(support, { q: "0300 123", page: 1, pageSize: 25 })).total).toBe(2)

    const readOnly = staffAs("read_only")
    const masked = await staff.list(readOnly, { q: "ayesha", page: 1, pageSize: 25 })
    expect(masked.orders[0].email).toBe("a•••@example.com")
    const detail = await staff.detail(readOnly, first.number)
    expect(detail.piiMasked).toBe(true)
    expect(detail.order.phone).toBe("•••567")
    expect(detail.order.shippingAddress.line1).toBe("•••")
    expect(detail.actions).toMatchObject({ transitions: [], markPaid: false, refund: false, note: false })

    await expect(staff.list(staffAs("content_editor"), { page: 1, pageSize: 25 })).rejects.toMatchObject({ code: "forbidden" })
  })

  it("moves orders along the state machine with the right permission, a tracking number and a reason to cancel", async () => {
    const order = await placeOrder()
    const fulfilment = staffAs("fulfilment")
    expect((await staff.detail(fulfilment, order.number)).actions.transitions).toEqual(["processing"])
    await staff.transition(fulfilment, meta, order.number, { to: "processing" })
    await expect(staff.transition(fulfilment, meta, order.number, { to: "shipped" })).rejects.toMatchObject({ code: "validation" })
    await expect(staff.transition(staffAs("support_agent"), meta, order.number, { to: "shipped", trackingNumber: "TCS123" })).rejects.toMatchObject({ code: "forbidden" })
    const shipped = await staff.transition(fulfilment, meta, order.number, { to: "shipped", trackingNumber: "TCS123" })
    expect(shipped).toMatchObject({ status: "shipped", trackingNumber: "TCS123", fulfillmentStatus: "fulfilled" })
    // Permission held, but the state machine refuses going backwards.
    await expect(staff.transition(fulfilment, meta, order.number, { to: "processing" })).rejects.toMatchObject({ code: "invalid_transition" })
    expect(db().outbox.filter((event) => event.topic === "order.status_changed")).toHaveLength(2)
    expect(audits.map((entry) => entry.action)).toEqual(["order.processing", "order.shipped"])

    const other = await placeOrder()
    const support = staffAs("support_agent")
    await expect(staff.transition(support, meta, other.number, { to: "cancelled" })).rejects.toMatchObject({ code: "validation" })
    await expect(staff.transition(support, meta, other.number, { to: "cancelled", reason: "Customer asked", expectedUpdatedAt: "2000-01-01T00:00:00.000Z" })).rejects.toMatchObject({ code: "conflict" })
    const stockBefore = db().inventory.find((row) => row.variantId === other.lines[0].variantId)!.onHand
    await staff.transition(support, meta, other.number, { to: "cancelled", reason: "Customer asked" })
    expect(db().inventory.find((row) => row.variantId === other.lines[0].variantId)!.onHand).toBe(stockBefore + 1)
    expect(audits.at(-1)).toMatchObject({ action: "order.cancelled", reason: "Customer asked" })
  })

  it("records an offline payment once per idempotency key and confirms a bank-transfer order", async () => {
    const order = await placeOrder({ paymentMethod: "bank_transfer" })
    expect(order.status).toBe("pending_payment")
    const finance = staffAs("finance")
    const input = { provider: "bank_transfer" as const, amount: order.total, reference: "HBL-778", idempotencyKey: "pay-key-0001" }
    await staff.markPaid(finance, meta, order.number, input)
    await staff.markPaid(finance, meta, order.number, input)
    expect(db().payments.filter((payment) => payment.orderId === order.id && payment.idempotencyKey.startsWith("admin:"))).toHaveLength(1)
    const detail = await staff.detail(finance, order.number)
    expect(detail.order).toMatchObject({ status: "confirmed", paymentStatus: "paid" })
    expect(detail.actions.markPaid).toBe(false)
    await expect(staff.markPaid(staffAs("fulfilment"), meta, order.number, { ...input, idempotencyKey: "pay-key-0002" })).rejects.toMatchObject({ code: "forbidden" })
  })

  it("refunds within the role's ceiling, only after a fresh second factor", async () => {
    const order = await placeOrder()
    await staff.markPaid(staffAs("finance"), meta, order.number, { provider: "cod", amount: order.total, idempotencyKey: "cod-collected-1" })
    const line = order.lines[0]
    const input = { amount: 100_000, reason: "Scuffed on arrival", lines: [{ orderLineId: line.id, quantity: 1 }], restock: true, idempotencyKey: "refund-key-1" }

    await expect(staff.refund(staffAs("support_agent", { steppedUp: false }), meta, order.number, input)).rejects.toMatchObject({ code: "forbidden", details: { stepUp: true } })
    await expect(staff.refund(staffAs("support_agent"), meta, order.number, { ...input, amount: 600_000 })).rejects.toMatchObject({ code: "forbidden", details: { refundLimit: 500_000 } })
    await expect(staff.refund(staffAs("fulfilment"), meta, order.number, input)).rejects.toMatchObject({ code: "forbidden" })

    const stockBefore = db().inventory.find((row) => row.variantId === line.variantId)!.onHand
    await staff.refund(staffAs("support_agent"), meta, order.number, input)
    await staff.refund(staffAs("support_agent"), meta, order.number, input)
    const detail = await staff.detail(staffAs("support_agent"), order.number)
    expect(detail.refunds).toHaveLength(1)
    expect(detail.order).toMatchObject({ refundedTotal: 100_000, paymentStatus: "partially_refunded" })
    expect(detail.actions.refundable).toBe(order.total - 100_000)
    expect(db().inventory.find((row) => row.variantId === line.variantId)!.onHand).toBe(stockBefore + 1)
    expect(audits.filter((entry) => entry.action === "order.refunded")).toHaveLength(2)
    await expect(staff.refund(staffAs("owner"), meta, order.number, { ...input, amount: order.total, idempotencyKey: "refund-key-2", lines: [] })).rejects.toMatchObject({ code: "validation" })
  })

  it("approves and receives returns, and keeps staff notes", async () => {
    const order = await placeOrder()
    const owner = staffAs("owner")
    for (const to of ["processing", "shipped", "delivered"] as const) await staff.transition(owner, meta, order.number, { to, trackingNumber: "LEO-1" })
    // The shopper asks for the return from their order link, as on the storefront.
    const delivered = (await orderService().lookupByNumber(STORE_ID, order.number))!
    const { id } = await orderService().requestReturn(delivered, { customerId: null, token: order.accessToken }, [{ orderLineId: order.lines[0].id, quantity: 1 }], "Too small")
    await expect(staff.decideReturn(staffAs("marketing"), meta, order.number, id, "approved", null)).rejects.toMatchObject({ code: "forbidden" })
    expect((await staff.decideReturn(staffAs("fulfilment"), meta, order.number, id, "approved", null)).status).toBe("approved")
    await expect(staff.decideReturn(staffAs("fulfilment"), meta, order.number, id, "rejected", null)).rejects.toMatchObject({ code: "invalid_transition" })
    expect((await staff.decideReturn(staffAs("fulfilment"), meta, order.number, id, "received", null)).status).toBe("received")

    await staff.addNote(staffAs("support_agent"), meta, order.number, "Customer called about sizing.")
    await expect(staff.addNote(staffAs("read_only"), meta, order.number, "x")).rejects.toMatchObject({ code: "forbidden" })
    const detail = await staff.detail(owner, order.number)
    expect(detail.notes).toMatchObject([{ authorName: "Support Agent", body: "Customer called about sizing." }])
  })

  it("exports CSV that can't run formulas and hides contact details without PII access", async () => {
    await placeOrder({ fullName: "=HYPERLINK(\"http://evil\")", email: "eve@example.com" })
    const rows = parseCsv(await staff.exportCsv(staffAs("finance"), meta, {}))
    expect(rows[0].customer).toBe("'=HYPERLINK(\"http://evil\")")
    expect(rows[0].email).toBe("eve@example.com")
    expect(rows[0].total).toMatch(/^\d+\.\d{2}$/)
    const storeManagerRows = parseCsv(await staff.exportCsv(staffAs("store_manager"), meta, {}))
    expect(storeManagerRows[0].email).toBe("eve@example.com")
    await expect(staff.exportCsv(staffAs("support_agent"), meta, {})).rejects.toMatchObject({ code: "forbidden" })
    expect(audits.filter((entry) => entry.action === "order.exported")).toHaveLength(2)
  })
})
