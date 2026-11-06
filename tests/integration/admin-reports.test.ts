import { beforeEach, describe, expect, it } from "vitest"

import { PRESET_ROLES } from "@/server/admin/permissions"
import { resolvePermissions, type RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import { cartService } from "@/server/cart"
import { contentService } from "@/server/content"
import { STORE_ID } from "@/server/fixtures/seed"
import { db, resetFixtures } from "@/server/fixtures/store"
import { parseCsv } from "@/server/import-export/csv"
import { orderService } from "@/server/orders"
import { reports, staffMarketing, staffSearch } from "@/server/reports"
import { pkDay } from "@/server/reports/service"
import { searchService } from "@/server/search"

/** Reports, marketing and search tools (admin A8) on the fixtures driver, through the real wiring. */

const meta: RequestMeta = { ip: "203.0.113.9", userAgent: "vitest", requestId: "req" }

function staffAs(roleKey: string): StaffContext {
  const role = PRESET_ROLES.find((preset) => preset.key === roleKey)!
  const { permissions, refundLimit } = resolvePermissions([{ permissions: [...role.permissions], refundLimit: role.refundLimit }])
  return {
    member: { userId: `user-${roleKey}`, storeId: STORE_ID, email: `${roleKey}@example.com`, displayName: role.name, status: "active", totpEnabledAt: "2026-01-01T00:00:00Z" },
    session: { id: `s-${roleKey}`, aal: 2, mfaAt: new Date().toISOString(), createdAt: "2026-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z" },
    roles: [{ id: roleKey, key: roleKey, name: role.name, refundLimit: role.refundLimit }],
    permissions,
    refundLimit,
  }
}

async function bag() {
  const level = db().inventory.find((row) => row.onHand >= 1)!
  const carts = cartService()
  const shopper = { storeId: STORE_ID, customerId: null, customerGroup: null, email: null }
  const { row } = await carts.create(STORE_ID, null)
  return { cart: await carts.addLine(row, level.variantId, 1, shopper), shopper }
}

async function placeOrder() {
  const { cart, shopper } = await bag()
  const email = "ayesha@example.com"
  const { order } = await orderService().checkout({
    cart,
    shopper: { ...shopper, email },
    email,
    phone: "03001234567",
    address: { fullName: "Ayesha Khan", phone: "03001234567", line1: "House 12", city: "Lahore", province: "Punjab", country: "PK" },
    shippingCode: "standard",
    paymentMethod: "cod",
    idempotencyKey: crypto.randomUUID(),
    orderUrl: (number) => `http://localhost/orders/${number}`,
  })
  return order
}

beforeEach(() => resetFixtures())

describe("reports", () => {
  it("counts today's sales, leaves cancelled orders out and values the stock", async () => {
    const kept = await placeOrder()
    const cancelled = await placeOrder()
    await orderService().transition(cancelled.id, "cancelled", "test")
    const today = pkDay(new Date().toISOString())
    const sales = await reports().sales(staffAs("finance"), today, today)
    expect(sales.totals).toMatchObject({ orders: 1, gross: kept.total, net: kept.total, cancelled: 1 })
    expect(sales.days).toHaveLength(1)
    expect(sales.topProducts[0]).toMatchObject({ productId: kept.lines[0].productId, units: 1 })
    expect(sales.methods).toEqual([{ method: "cod", orders: 1, total: kept.total }])
    const stock = await reports().inventoryValue(staffAs("finance"))
    expect(stock.value).toBeGreaterThan(0)
    await expect(reports().sales(staffAs("support_agent"), today, today)).rejects.toMatchObject({ code: "forbidden" })
    const csv = parseCsv(await reports().exportSales(staffAs("finance"), meta, today, today))
    expect(csv[0]).toMatchObject({ day: today, orders: "1" })
  })
})

describe("marketing and search tools", () => {
  it("lists subscribers (masked without PII access), exports them, and finds abandoned bags", async () => {
    await contentService().subscribe(STORE_ID, "nadia@example.com", "footer")
    const owner = staffAs("owner")
    expect((await staffMarketing().subscribers(owner, { status: "subscribed", page: 1, pageSize: 50 })).rows[0].email).toBe("nadia@example.com")
    expect((await staffMarketing().subscribers(staffAs("marketing"), { page: 1, pageSize: 50 })).rows[0].email).toBe("n•••@example.com")
    expect(parseCsv(await staffMarketing().exportSubscribers(staffAs("marketing"), meta, "Monthly email"))[0].email).toBe("nadia@example.com")

    const { cart } = await bag()
    const stale = db().carts.find((row) => row.id === cart.id)!
    stale.updatedAt = new Date(Date.now() - 3 * 3_600_000).toISOString()
    const abandoned = await staffMarketing().abandoned(staffAs("marketing"), { olderThanHours: 2, page: 1, pageSize: 50 })
    expect(abandoned.rows.map((row) => row.id)).toEqual([cart.id])
    expect(abandoned.rows[0].value).toBeGreaterThan(0)
  })

  it("reports searches that found nothing and fixes them with synonyms", async () => {
    await searchService().logSearch(STORE_ID, "trainers", 0, "page")
    await searchService().logSearch(STORE_ID, "Trainers", 0, "overlay")
    const marketing = staffAs("marketing")
    const report = await staffSearch().report(marketing, 30)
    expect(report.zero[0]).toEqual({ query: "trainers", count: 2 })
    const group = await staffSearch().saveSynonym(marketing, meta, { term: " Trainers ", synonyms: ["Sneakers", "trainers", "shoes"] })
    expect(group).toMatchObject({ term: "trainers", synonyms: ["sneakers", "shoes"] })
    await expect(staffSearch().saveSynonym(marketing, meta, { term: "trainers", synonyms: ["kicks"] })).rejects.toMatchObject({ code: "conflict" })
    expect((await searchService().synonymMap(STORE_ID)).get("trainers")).toEqual(expect.arrayContaining(["sneakers", "shoes"]))
    await expect(staffSearch().saveSynonym(staffAs("support_agent"), meta, { term: "x", synonyms: ["y"] })).rejects.toMatchObject({ code: "forbidden" })
  })
})
