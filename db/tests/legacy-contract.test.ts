import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { ALL_PERMISSIONS, PRESET_ROLES, PERMISSIONS, isSensitive } from "@/server/admin/permissions"
import { createFixturesAdminRepository } from "@/server/admin/fixtures.repository"
import { createMysqlAdminRepository } from "@/server/admin/mysql.repository"
import type { AdminOperations } from "@/server/admin/repository"
import { createFixturesCartRepository } from "@/server/cart/fixtures.repository"
import { createMysqlCartRepository } from "@/server/cart/mysql.repository"
import type { CartOperations } from "@/server/cart/repository"
import { createFixturesCatalogRepository } from "@/server/catalog/fixtures.repository"
import { createMysqlCatalogRepository } from "@/server/catalog/mysql.repository"
import type { CatalogOperations } from "@/server/catalog/repository"
import { createFixturesInventoryRepository } from "@/server/inventory/fixtures.repository"
import { createMysqlInventoryRepository } from "@/server/inventory/mysql.repository"
import type { InventoryOperations } from "@/server/inventory/repository"
import { createFixturesOrderRepository } from "@/server/orders/fixtures.repository"
import { createMysqlOrderRepository } from "@/server/orders/mysql.repository"
import type { OrderDraft, OrderOperations } from "@/server/orders/repository"
import { createFixturesMediaRepository } from "@/server/media/fixtures.repository"
import { createMysqlMediaRepository } from "@/server/media/mysql.repository"
import type { MediaOperations } from "@/server/media/repository"
import { createFixturesSearchRepository } from "@/server/search/fixtures.repository"
import { createMysqlSearchRepository } from "@/server/search/mysql.repository"
import type { SearchOperations } from "@/server/search/repository"
import type { SearchEvent } from "@/server/search/types"
import { anonymousActor, systemActor, type ActorScoped } from "@/server/db/actor"
import { bindActor } from "@/server/db/bind"
import { closeDatabase } from "@/server/db/client"
import { importSnapshot } from "@/server/db/import.repository"
import { uuidv7 } from "@/server/db/uuid"
import { STORE_ID } from "@/server/fixtures/seed"
import { db as fixtures, resetFixtures } from "@/server/fixtures/store"
import { readDemoFixture } from "@/server/fixtures/demo"
import { engines } from "./connections"
import { isolatedDatabase } from "./isolated-database"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
for (const [engine] of [["fixtures"], ...engines] as const) describe(engine + " retained SQL-era behavior", () => {
  const fixture = engine === "fixtures", actor = systemActor(STORE_ID, "migration", ALL_PERMISSIONS), storeId = actor.storeId
  const bind = <T extends object>(reference: () => ActorScoped<T>, native: () => ActorScoped<T>) => bindActor<T>((fixture ? reference : native)(), () => actor)
  const catalog = bind<CatalogOperations>(createFixturesCatalogRepository, createMysqlCatalogRepository)
  const carts = bind<CartOperations>(createFixturesCartRepository, createMysqlCartRepository)
  const inventory = bind<InventoryOperations>(createFixturesInventoryRepository, createMysqlInventoryRepository)
  const orders = bind<OrderOperations>(createFixturesOrderRepository, createMysqlOrderRepository)
  const media = bind<MediaOperations>(createFixturesMediaRepository, createMysqlMediaRepository)
  const admin = bind<AdminOperations>(createFixturesAdminRepository, createMysqlAdminRepository)
  const search = bind<SearchOperations>(createFixturesSearchRepository, createMysqlSearchRepository)
  let isolated: Awaited<ReturnType<typeof isolatedDatabase>> | undefined
  beforeAll(async () => {
    if (fixture) { resetFixtures(); fixtures().searchEvents = [] }
    else {
      await closeDatabase(); isolated = await isolatedDatabase(engine); process.env.DATABASE_URL = isolated.appUrl
      const source = await fs.readFile("db/seed/demo.json", "utf8")
      await importSnapshot(actor, readDemoFixture(source), hash(source))
    }
  })
  afterAll(async () => { if (!fixture) { await closeDatabase(); await isolated?.remove() } })

  async function cart(variantId: string, quantity: number, promotionCodes: string[] = []) {
    const at = new Date().toISOString()
    return carts.create({ id: uuidv7(), storeId, tokenHash: hash(uuidv7()), customerId: null, currency: "PKR", lines: quantity ? [{ id: uuidv7(), variantId, quantity, addedAt: at }] : [], promotionCodes, status: "active", createdAt: at, updatedAt: at })
  }
  async function variant(index: number) {
    const product = (await catalog.searchProducts(storeId, { page: 1, pageSize: 100 })).products[index]
    return { product, variant: product.variants[0] }
  }
  it("syncs the registry idempotently without deleting custom roles and guards role lifecycle", async () => {
    const at = new Date().toISOString(), custom = { id: uuidv7(), storeId, key: "legacy_contract", name: "Contract", description: "Retained custom role", isSystem: false, refundLimit: 10000, permissions: ["products:read" as const], createdAt: at, updatedAt: at }
    await admin.createRole(custom)
    const registry = ALL_PERMISSIONS.map((key) => ({ key, label: PERMISSIONS[key].label, group: PERMISSIONS[key].group, sensitive: isSensitive(key) }))
    await admin.syncRegistry(storeId, registry, PRESET_ROLES)
    await admin.syncRegistry(storeId, registry, PRESET_ROLES)
    expect((await admin.findRole(storeId, custom.key))?.id).toBe(custom.id)
    expect((await admin.listRoles(storeId)).filter((row) => row.isSystem)).toHaveLength(PRESET_ROLES.length)
    await expect(admin.deleteRole(storeId, "owner")).rejects.toMatchObject({ code: "forbidden" })
    await expect(admin.updateRole(storeId, "owner", { permissions: [] })).rejects.toMatchObject({ code: "forbidden" })
    const updated = await admin.updateRole(storeId, custom.key, { name: "Updated" }, at)
    expect(updated.updatedAt).not.toBe(at)
    await expect(admin.updateRole(storeId, custom.key, { name: "Stale" }, at)).rejects.toMatchObject({ code: "conflict" })
    const userId = uuidv7()
    await admin.createMember({ userId, storeId, email: userId + "@legacy.example.test", displayName: "Contract", status: "active", passwordHash: null, totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [], failedLogins: 0, lockedUntil: null, lastSeenAt: null, createdAt: at, updatedAt: at })
    const member = await admin.findMember(storeId, userId)
    const renamed = await admin.updateMember(storeId, userId, { displayName: "Renamed" })
    expect(renamed.updatedAt).not.toBe(member!.updatedAt)
    await expect(admin.setRoles(storeId, userId, ["unknown_role"])).rejects.toMatchObject({ code: "validation" })
    await admin.setRoles(storeId, userId, [custom.key])
    await expect(admin.deleteRole(storeId, custom.key)).rejects.toMatchObject({ code: "conflict" })
    await admin.setRoles(storeId, userId, ["read_only"])
    await admin.deleteRole(storeId, custom.key)
  })
  it("allocates twenty unique consecutive order numbers under contention and rejects another store", async () => {
    const numbers = await Promise.all(Array.from({ length: 20 }, () => orders.nextOrderNumber(storeId)))
    expect(new Set(numbers).size).toBe(20)
    const values = numbers.map((number) => Number(number.replace(/^\D+/, ""))).sort((a, b) => a - b)
    expect(values).toEqual(Array.from({ length: 20 }, (_value, index) => values[0] + index))
    await expect(orders.nextOrderNumber(uuidv7())).rejects.toMatchObject({ code: "forbidden" })
  })
  it("replaces owned holds, rolls back all lines and releases only the requested cart", async () => {
    const a = await variant(0), b = await variant(1)
    const levels = await inventory.levels([a.variant.id, b.variant.id])
    await inventory.adjust(a.variant.id, 3 - levels.find((row) => row.variantId === a.variant.id)!.onHand, "Contract stock", "migration")
    const mine = await cart(a.variant.id, 0), other = await cart(a.variant.id, 0)
    await inventory.reserve(mine.id, [{ variantId: a.variant.id, quantity: 2 }], 15)
    await inventory.reserve(mine.id, [{ variantId: a.variant.id, quantity: 1 }], 15)
    expect((await inventory.levels([a.variant.id]))[0].reserved).toBe(1)
    await expect(inventory.adjust(a.variant.id, -3, "Invalid held stock", "migration")).rejects.toMatchObject({ code: "out_of_stock" })
    await expect(inventory.adjust(a.variant.id, -4, "Invalid negative stock", "migration")).rejects.toMatchObject({ code: "out_of_stock" })
    expect((await inventory.levels([a.variant.id]))[0].onHand).toBe(3)
    await expect(inventory.reserve(mine.id, [{ variantId: a.variant.id, quantity: 1 }, { variantId: b.variant.id, quantity: 9999 }], 15)).rejects.toMatchObject({ code: "out_of_stock" })
    expect((await inventory.levels([a.variant.id]))[0].reserved).toBe(1)
    expect((await inventory.availability([a.variant.id], mine.id)).get(a.variant.id)).toBe(3)
    expect((await inventory.availability([a.variant.id])).get(a.variant.id)).toBe(2)
    await inventory.reserve(other.id, [{ variantId: a.variant.id, quantity: 1 }], 15)
    await inventory.reserve(mine.id, [], 15); await inventory.reserve(mine.id, [], 15)
    expect((await inventory.levels([a.variant.id]))[0].reserved).toBe(1)
    await inventory.release(other.id)
  })
  it("merges a guest cart once under concurrency, caps by stock/ten and preserves codes", async () => {
    const { variant: size } = await variant(0)
    const guest = await cart(size.id, 2, ["WELCOME10"]), target = await cart(size.id, 2)
    await inventory.reserve(guest.id, [{ variantId: size.id, quantity: 1 }], 15)
    const result = await Promise.all([carts.merge(guest.id, target.id), carts.merge(guest.id, target.id), carts.merge(guest.id, target.id)])
    for (const merged of result) expect(merged.lines[0].quantity).toBe(3)
    expect((await carts.findById(guest.id))?.status).toBe("merged")
    expect((await carts.findById(target.id))?.promotionCodes).toContain("WELCOME10")
    expect((await inventory.levels([size.id]))[0].reserved).toBe(0)
    await inventory.adjust(size.id, 17, "Contract stock", "migration")
    const many = await cart(size.id, 8), mine = await cart(size.id, 8)
    expect((await carts.merge(many.id, mine.id)).lines[0].quantity).toBe(10)
  })
  it("keeps purchased image usage private and refuses ordered-size removal/taken slugs atomically", async () => {
    const { product, variant: size } = await variant(0), basket = await cart(size.id, 1), key = uuidv7()
    const lineId = uuidv7(), imageUrl = product.images[0].url
    const draft: OrderDraft = { storeId, customerId: null, email: "legacy-test@example.test", phone: "03001234567", status: "confirmed", paymentStatus: "unpaid", fulfillmentStatus: "unfulfilled", currency: "PKR", subtotal: 10000, discountTotal: 0, shippingTotal: 0, taxTotal: 0, taxIncluded: true, total: 10000, lines: [{ id: lineId, variantId: size.id, productId: product.id, slug: product.slug, title: product.title, brand: product.brand.name, kind: product.kind, condition: product.condition, size: size.size, imageUrl, sku: size.sku, quantity: 1, unitPrice: 10000, compareAt: null, discount: 0, tax: 0, total: 10000, refundedQuantity: 0 }], promotionCodes: [], shippingAddress: { fullName: "Legacy test", phone: "03001234567", line1: "Test", city: "Karachi", province: "Sindh", country: "PK" }, shippingMethod: { code: "standard", label: "Standard", amount: 0, minDays: 2, maxDays: 5 }, paymentMethod: "cod", idempotencyKey: key, accessTokenHash: hash(uuidv7()), customFields: {}, note: null, trackingNumber: null }
    await orders.placeOrder({ draft, cartId: basket.id, promotionIds: [], event: { topic: "order.placed", payload: {} } })
    expect(await media.hasOrderUsage(storeId, imageUrl)).toBe(true)
    const rawMedia = fixture ? createFixturesMediaRepository() : createMysqlMediaRepository(), foreignId = uuidv7()
    expect(await rawMedia.hasOrderUsage(systemActor(foreignId, "integration", ["media:read"]), foreignId, imageUrl)).toBe(false)
    await expect(rawMedia.hasOrderUsage(anonymousActor(storeId), storeId, imageUrl)).rejects.toMatchObject({ code: "forbidden" })
    await expect(catalog.saveProduct(storeId, { ...product, variants: product.variants.filter((row) => row.id !== size.id) }, null)).rejects.toMatchObject({ code: "conflict" })
    const other = await variant(1)
    await expect(catalog.saveProduct(storeId, { ...product, slug: other.product.slug }, null)).rejects.toMatchObject({ code: "conflict" })
    expect((await catalog.getProductById(storeId, product.id))?.variants.some((row) => row.id === size.id)).toBe(true)
  })
  it("retains successful-search counts, minimum windows/limits, invalid-event rejection and fuzzy merchant lookup", async () => {
    const at = new Date().toISOString(), event = (query: string, extra: Partial<SearchEvent> = {}): SearchEvent => ({ id: uuidv7(), query, normalized: query, resultCount: 2, clickedSlug: null, source: "page", createdAt: at, ...extra })
    for (const item of [event("kayano"), event("kayano"), event("asics"), event("missing", { resultCount: 0 }), event("kayano", { resultCount: null, clickedSlug: "shoe" }), event("old", { createdAt: new Date(Date.now() - 90 * 86_400_000).toISOString() })]) await search.logEvent(storeId, item)
    expect(await search.trending(storeId, 30, 10)).toEqual([{ query: "kayano", count: 2 }, { query: "asics", count: 1 }])
    expect(await search.trending(storeId, 0, -5)).toEqual([{ query: "kayano", count: 2 }])
    await expect(search.logEvent(storeId, event("invalid", { clickedSlug: "shoe" }))).rejects.toMatchObject({ code: "validation" })
    await expect(search.logEvent(storeId, event("invalid", { resultCount: null }))).rejects.toMatchObject({ code: "validation" })
    await expect(search.logEvent(storeId, { ...event("invalid"), source: "email" } as unknown as SearchEvent)).rejects.toMatchObject({ code: "validation" })
    expect(await search.similarQueries(storeId, "kayanno", 30, 10)).toEqual(["kayano"])
    const raw = fixture ? createFixturesSearchRepository() : createMysqlSearchRepository()
    await expect(raw.report(anonymousActor(storeId), storeId, 30, 10)).rejects.toMatchObject({ code: "forbidden" })
    await expect(raw.similarQueries(anonymousActor(storeId), storeId, "kayanno", 30, 10)).rejects.toMatchObject({ code: "forbidden" })
  })
  it("upserts catalogue imports by slug without duplicating products or images", async () => {
    const { product } = await variant(1), id = uuidv7(), size = { ...product.variants[0], id: uuidv7(), sku: "LEGACY-" + uuidv7() }
    const input = { ...product, id, slug: "legacy-import", images: [{ url: "/a.webp", alt: "Side", width: 800, height: 800, role: "card" as const }], variants: [size], collections: [] }
    const before = (await catalog.searchProducts(storeId, { page: 1, pageSize: 100 })).total
    for (let run = 0; run < 2; run++) expect(await catalog.upsertProducts(storeId, [{ ...input, title: "Legacy import v" + run }])).toBe(1)
    const saved = await catalog.getProductBySlug(storeId, input.slug)
    expect(saved?.title).toBe("Legacy import v1")
    expect(saved?.images).toEqual(input.images)
    expect((await catalog.searchProducts(storeId, { page: 1, pageSize: 100 })).total).toBe(before + 1)
  })
})
