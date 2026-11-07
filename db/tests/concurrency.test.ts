import { createHash } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { eq, sql } from "drizzle-orm"
import { ALL_PERMISSIONS, PERMISSIONS, PRESET_ROLES } from "@/server/admin/permissions"
import { createMysqlAdminRepository } from "@/server/admin/mysql.repository"
import { createMysqlCatalogRepository } from "@/server/catalog/mysql.repository"
import { createMysqlCartRepository } from "@/server/cart/mysql.repository"
import { createMysqlInventoryRepository } from "@/server/inventory/mysql.repository"
import { createMysqlOrderRepository } from "@/server/orders/mysql.repository"
import { createMysqlPromotionRepository } from "@/server/promotions/mysql.repository"
import { systemActor } from "@/server/db/actor"
import { closeDatabase, database, withTransaction } from "@/server/db/client"
import { inventoryLevels, inventoryReservations, stores } from "@/server/db/schema"
import { uuidToBytes, uuidv7 } from "@/server/db/uuid"
import type { Product } from "@/server/catalog/types"
import type { CartRow } from "@/server/cart/types"
import type { OrderDraft, PlaceOrderInput } from "@/server/orders/repository"
import { connect, engines } from "./connections"

const iterations = Array.from({ length: 50 }, (_, index) => index + 1)
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
for (const [engine, configuration] of engines) describe(engine + " independent-connection races", () => {
  const storeId = uuidv7(), actor = systemActor(storeId, "migration", ALL_PERMISSIONS)
  const catalog = createMysqlCatalogRepository(), carts = createMysqlCartRepository(), inventory = createMysqlInventoryRepository(), orders = createMysqlOrderRepository(), promotions = createMysqlPromotionRepository(), admin = createMysqlAdminRepository()
  const variantId = uuidv7(), ownerA = uuidv7(), ownerB = uuidv7()
  let product: Product
  beforeAll(async () => {
    await closeDatabase(); process.env.DATABASE_URL = configuration.appUrl
    await (await database()).insert(stores).values({ id: storeId, name: "Concurrency test" })
    const brand = { id: uuidv7(), slug: "race-brand", name: "Race brand", position: 0 }
    await catalog.createBrand(actor, storeId, brand)
    product = await catalog.saveProduct(actor, storeId, { id: uuidv7(), storeId, slug: "race-product", title: "Race product", brand, kind: "new", gender: "unisex", status: "active", description: "", condition: null, conditionNotes: null, images: [], variants: [{ id: variantId, sku: "RACE-" + storeId, size: { eu: "42", uk: "8", us: "9", cm: "27" }, attributes: {}, weightGrams: 0, position: 0 }], attributes: {}, customFields: {}, collections: [], tags: [], position: 0, publishedAt: new Date().toISOString(), seo: {} }, null)
    await admin.syncRegistry(actor, storeId, ALL_PERMISSIONS.map((key) => ({ key, label: PERMISSIONS[key].label, group: PERMISSIONS[key].group, sensitive: false })), PRESET_ROLES)
    for (const userId of [ownerA, ownerB]) {
      const at = new Date().toISOString()
      await admin.createMember(actor, { userId, storeId, email: userId + "@example.test", displayName: "Race Owner", status: "active", passwordHash: null, totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [], failedLogins: 0, lockedUntil: null, lastSeenAt: null, createdAt: at, updatedAt: at })
      await admin.setRoles(actor, storeId, userId, ["owner"])
    }
  })
  afterAll(async () => {
    await closeDatabase()
    const cleanup = await connect(configuration.migratorUrl)
    try {
      const id = uuidToBytes(storeId)
      await cleanup.execute("DELETE r FROM refunds r INNER JOIN orders o ON o.id = r.order_id WHERE o.store_id = ?", [id])
      await cleanup.execute("DELETE FROM orders WHERE store_id = ?", [id])
      await cleanup.execute("DELETE FROM products WHERE store_id = ?", [id])
      await cleanup.execute("DELETE FROM staff_roles WHERE store_id = ?", [id])
      await cleanup.execute("DELETE FROM order_number_sequences WHERE store_id = ?", [id])
      await cleanup.execute("DELETE FROM stores WHERE id = ?", [id])
    } finally { await cleanup.end() }
  })

  async function stock(quantity: number) {
    const db = await database()
    await db.delete(inventoryReservations).where(eq(inventoryReservations.variantId, variantId))
    await db.update(inventoryLevels).set({ onHand: quantity, reserved: 0 }).where(eq(inventoryLevels.variantId, variantId))
  }
  async function buyer(email = uuidv7() + "@example.test"): Promise<PlaceOrderInput> {
    const at = new Date().toISOString()
    const cart: CartRow = { id: uuidv7(), storeId, tokenHash: hash(uuidv7()), customerId: null, currency: "PKR", lines: [{ id: uuidv7(), variantId, quantity: 1, addedAt: at }], promotionCodes: [], status: "active", createdAt: at, updatedAt: at }
    await carts.create(actor, cart)
    const draft: OrderDraft = { storeId, customerId: null, email, phone: "03001234567", status: "confirmed", paymentStatus: "unpaid", fulfillmentStatus: "unfulfilled", currency: "PKR", subtotal: 10000, discountTotal: 0, shippingTotal: 0, taxTotal: 0, taxIncluded: true, total: 10000, lines: [{ id: uuidv7(), variantId, productId: product.id, slug: product.slug, title: product.title, brand: product.brand.name, kind: "new", condition: null, size: { eu: "42", uk: "8", us: "9" }, imageUrl: "", sku: product.variants[0].sku, quantity: 1, unitPrice: 10000, compareAt: null, discount: 0, tax: 0, total: 10000, refundedQuantity: 0 }], promotionCodes: [], shippingAddress: { fullName: "Race buyer", phone: "03001234567", line1: "Test", city: "Karachi", province: "Sindh", country: "PK" }, shippingMethod: { code: "standard", label: "Standard", amount: 0, minDays: 2, maxDays: 5 }, paymentMethod: "cod", idempotencyKey: uuidv7(), accessTokenHash: hash(uuidv7()), customFields: {}, note: null, trackingNumber: null }
    return { draft, cartId: cart.id, promotionIds: [], event: { topic: "order.placed", payload: {} } }
  }
  async function race<T>(work: (index: number) => Promise<T>): Promise<PromiseSettledResult<T>[]> {
    let arrive = 0, release: () => void = () => undefined
    const barrier = new Promise<void>((resolve) => { release = resolve })
    const connectionIds: number[] = []
    const results = await Promise.allSettled([0, 1].map((index) => withTransaction(async (db) => {
      // A realistic earlier request read establishes the RR snapshot before either writer wins.
      const [connection] = await db.select({ id: sql.raw("CONNECTION_ID()").mapWith(Number) }).from(stores).where(eq(stores.id, storeId))
      connectionIds.push(connection.id)
      if (++arrive === 2) release()
      await barrier
      return work(index)
    })))
    expect(new Set(connectionIds).size).toBe(2)
    return results
  }
  function exactlyOne(results: PromiseSettledResult<unknown>[], code: string) {
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1)
    const failed = results.find((row) => row.status === "rejected") as PromiseRejectedResult
    expect(failed.reason).toMatchObject({ code })
  }

  describe("last physical unit", () => it.each(iterations)("iteration %i", async () => {
    await stock(1)
    const inputs = [await buyer(), await buyer()]
    exactlyOne(await race((index) => orders.placeOrder(actor, inputs[index])), "out_of_stock")
    expect((await inventory.levels(actor, [variantId]))[0]).toMatchObject({ onHand: 0, reserved: 0 })
  }))
  describe("same checkout idempotency key", () => it.each(iterations)("iteration %i", async () => {
    await stock(2)
    const input = await buyer(), results = await race(() => orders.placeOrder(actor, input))
    expect(results.every((row) => row.status === "fulfilled")).toBe(true)
    const values = results.map((row) => (row as PromiseFulfilledResult<Awaited<ReturnType<typeof orders.placeOrder>>>).value)
    expect(new Set(values.map((row) => row.order.id)).size).toBe(1)
    expect(values.filter((row) => row.replayed)).toHaveLength(1)
    expect((await inventory.onHand(actor, [variantId])).get(variantId)).toBe(1)
  }))
  for (const perCustomer of [false, true]) describe(perCustomer ? "coupon per-customer limit" : "coupon global usage limit", () => it.each(iterations)("iteration %i", async () => {
    await stock(2)
    const email = uuidv7() + "@example.test", inputs = [await buyer(email), await buyer(email)], id = uuidv7()
    await promotions.save(actor, { id, storeId, code: null, title: "Race coupon", conditions: [], actions: [], startsAt: null, endsAt: null, usageLimit: perCustomer ? null : 1, perCustomerLimit: perCustomer ? 1 : null, timesUsed: 0, active: true, combinable: false })
    for (const input of inputs) input.promotionIds = [id]
    exactlyOne(await race((index) => orders.placeOrder(actor, inputs[index])), "promotion_invalid")
    expect((await promotions.find(actor, storeId, id))?.timesUsed).toBe(1)
  }))
  describe("first-order discount", () => it.each(iterations)("iteration %i", async () => {
    await stock(2)
    const email = uuidv7() + "@example.test", inputs = [await buyer(email), await buyer(email)], id = uuidv7()
    await promotions.save(actor, { id, storeId, code: null, title: "First order", conditions: [{ type: "first_order" }], actions: [], startsAt: null, endsAt: null, usageLimit: null, perCustomerLimit: null, timesUsed: 0, active: true, combinable: false })
    for (const input of inputs) input.promotionIds = [id]
    exactlyOne(await race((index) => orders.placeOrder(actor, inputs[index])), "promotion_invalid")
    expect((await promotions.find(actor, storeId, id))?.timesUsed).toBe(1)
  }))
  describe("reservation expiry versus checkout", () => it.each(iterations)("iteration %i", async () => {
    await stock(1)
    const input = await buyer()
    await inventory.reserve(actor, input.cartId, [{ variantId, quantity: 1 }], 15)
    await (await database()).update(inventoryReservations).set({ expiresAt: "2000-01-01 00:00:00.000" }).where(eq(inventoryReservations.cartId, input.cartId))
    const results = await race(async (index) => index === 0 ? orders.placeOrder(actor, input) : inventory.releaseExpired(actor))
    expect(results.every((row) => row.status === "fulfilled")).toBe(true)
    expect((await inventory.levels(actor, [variantId]))[0]).toMatchObject({ onHand: 0, reserved: 0 })
  }))
  describe("concurrent refunds", () => it.each(iterations)("iteration %i", async () => {
    await stock(1)
    const placed = await orders.placeOrder(actor, await buyer())
    const payment = await orders.recordPayment(actor, { orderId: placed.order.id, provider: "cod", status: "captured", amount: 10000, currency: "PKR", providerRef: null, idempotencyKey: uuidv7() })
    const keys = [uuidv7(), uuidv7()]
    exactlyOne(await race((index) => orders.createRefund(actor, { orderId: placed.order.id, paymentId: payment.id, amount: 8000, reason: "Race", lines: [], restock: false, idempotencyKey: keys[index] })), "validation")
    expect((await orders.findById(actor, placed.order.id))?.refundedTotal).toBe(8000)
    expect((await orders.listRefunds(actor, placed.order.id))).toHaveLength(1)
  }))
  describe("last active Owner", () => it.each(iterations)("iteration %i", async () => {
    await admin.setRoles(actor, storeId, ownerA, ["owner"])
    await admin.setRoles(actor, storeId, ownerB, ["owner"])
    exactlyOne(await race((index) => admin.setRoles(actor, storeId, index === 0 ? ownerA : ownerB, [])), "conflict")
    expect(await admin.countActiveOwners(actor, storeId)).toBe(1)
  }))
  describe("optimistic product edits", () => it.each(iterations)("iteration %i", async () => {
    product = (await catalog.getProductById(actor, storeId, product.id))!
    const expected = product.updatedAt!
    exactlyOne(await race((index) => catalog.saveProduct(actor, storeId, { ...product, title: "Edited " + index }, expected)), "conflict")
    const saved = (await catalog.getProductById(actor, storeId, product.id))!
    expect(saved.updatedAt! > expected).toBe(true)
  }))
  describe("optimistic order edits", () => it.each(iterations)("iteration %i", async () => {
    await stock(1)
    const { order } = await orders.placeOrder(actor, await buyer())
    exactlyOne(await race((index) => orders.transition(actor, order.id, index === 0 ? "processing" : "cancelled", "migration", "Race change", undefined, order.updatedAt)), "conflict")
    const saved = (await orders.findById(actor, order.id))!
    expect(saved.updatedAt > order.updatedAt).toBe(true)
    expect((await inventory.onHand(actor, [variantId])).get(variantId)).toBe(saved.status === "cancelled" ? 1 : 0)
  }))
})
