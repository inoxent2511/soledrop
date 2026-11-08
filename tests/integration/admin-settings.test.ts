import { anonymousActor, staffActor } from "@/server/db/actor"
import { withActor } from "@/server/db/context"
import { beforeEach, describe, expect, it } from "vitest"

import { type RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import { cartService } from "@/server/cart"
import { STORE_ID } from "@/server/fixtures/seed"
import { db, resetFixtures } from "@/server/fixtures/store"
import { orderService } from "@/server/orders"
import { platform } from "@/server/platform"
import { insights, staffPlatform } from "@/server/reports"
import { fixtureStaff } from "@/tests/helpers/staff"

/** Settings, audit viewer, notifications and command palette (admin A9) on the fixtures driver. */

const meta: RequestMeta = { ip: "203.0.113.9", userAgent: "vitest", requestId: "req" }

function staffAs(roleKey: string): StaffContext {
  return fixtureStaff(roleKey)
}

async function placeOrder(paymentMethod = "cod") {
  const level = db().inventory.find((row) => row.onHand >= 1)!
  const carts = cartService()
  const shopper = { storeId: STORE_ID, customerId: null, customerGroup: null, email: null }
  const { row } = await carts.create(STORE_ID, null)
  const cart = await carts.addLine(row, level.variantId, 1, shopper)
  const { order } = await orderService().checkout({
    cart,
    shopper: { ...shopper, email: "zainab@example.com" },
    email: "zainab@example.com",
    phone: "03001234567",
    address: { fullName: "Zainab Ali", phone: "03001234567", line1: "House 1", city: "Lahore", province: "Punjab", country: "PK" },
    shippingCode: "standard",
    paymentMethod,
    idempotencyKey: crypto.randomUUID(),
    orderUrl: (number) => `http://localhost/orders/${number}`,
  })
  return order
}

beforeEach(() => resetFixtures())

describe("settings", () => {
  it("switches flags with an audit entry, and keeps them to settings:flags", async () => withActor(anonymousActor(STORE_ID), async () => {
    const flag = structuredClone(db().flags[0])
    const saved = await staffPlatform().setFlag(staffAs("admin"), meta, flag.key, { enabled: !flag.enabled })
    expect(saved.enabled).toBe(!flag.enabled)
    expect(db().audit.at(-1)).toMatchObject({ action: "flag.changed", entityId: flag.key })
    await expect(staffPlatform().setFlag(staffAs("store_manager"), meta, flag.key, { enabled: flag.enabled })).resolves.toBeTruthy()
    await expect(staffPlatform().setFlag(staffAs("marketing"), meta, flag.key, { enabled: true })).rejects.toMatchObject({ code: "forbidden" })
  }))

  it("shows integrations without secrets, retries failed events and runs jobs on demand", async () => withActor(anonymousActor(STORE_ID), async () => {
    const integrations = await staffPlatform().integrations(staffAs("read_only"))
    expect(JSON.stringify(integrations)).not.toMatch(/secret|key=/i)
    const event = await platform().enqueue(STORE_ID, "contact.received", { name: "x" })
    db().outbox.find((row) => row.id === event.id)!.status = "failed"
    expect((await staffPlatform().outbox(staffAs("admin"))).failed).toBe(1)
    await expect(staffPlatform().retryEvent(staffAs("store_manager"), meta, event.id)).resolves.toBeUndefined()
    expect(db().outbox.find((row) => row.id === event.id)?.status).toBe("pending")
    await expect(staffPlatform().retryEvent(staffAs("admin"), meta, event.id)).rejects.toMatchObject({ code: "conflict" })
    await expect(staffPlatform().runJob(staffAs("support_agent"), meta, "release-reservations")).rejects.toMatchObject({ code: "forbidden" })
    expect(await staffPlatform().runJob(staffAs("admin"), meta, "release-reservations")).toEqual({ released: 0 })
    expect((await staffPlatform().health(staffAs("admin"))).database).toBe(true)
  }))

  it("searches the audit log for audit:read holders only", async () => withActor(anonymousActor(STORE_ID), async () => {
    const order = await placeOrder()
    const fulfilment = staffAs("fulfilment")
    await withActor(staffActor(fulfilment), () => orderService().transition(order.id, "processing", "staff:" + fulfilment.member.userId))
    const { entries } = await staffPlatform().audit(staffAs("owner"), { q: order.id, page: 1, pageSize: 50 })
    expect(entries.map((entry) => entry.action)).toContain("order.transition")
    await expect(staffPlatform().audit(staffAs("read_only"), { page: 1, pageSize: 50 })).rejects.toMatchObject({ code: "forbidden" })
  }))
})

describe("notifications and command palette", () => {
  it("lists what needs attention for each role, and searches only what the role may see", async () => withActor(anonymousActor(STORE_ID), async () => {
    const order = await placeOrder()
    await placeOrder("bank_transfer")
    const owner = await insights().attention(staffAs("owner"))
    expect(owner.map((item) => item.key)).toEqual(expect.arrayContaining(["bank-transfers", "to-pack"]))
    const fulfilment = await insights().attention(staffAs("fulfilment"))
    expect(fulfilment.map((item) => item.key)).not.toContain("bank-transfers")

    const found = await insights().command(staffAs("support_agent"), order.number)
    expect(found).toContainEqual(expect.objectContaining({ group: "Orders", label: order.number, href: `/admin/orders/${order.number}` }))
    const pages = await insights().command(staffAs("content_editor"), "")
    expect(pages.map((item) => item.label)).toContain("Pages & FAQs")
    expect(pages.map((item) => item.label)).not.toContain("Orders")
    expect(await insights().command(staffAs("content_editor"), order.number)).not.toContainEqual(expect.objectContaining({ group: "Orders" }))
  }))
})
