import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { and, eq } from "drizzle-orm"
import { ALL_PERMISSIONS } from "@/server/admin/permissions"
import { systemActor } from "@/server/db/actor"
import { closeDatabase, database } from "@/server/db/client"
import { priceLists, storefrontContent, stores } from "@/server/db/schema"
import { uuidv7 } from "@/server/db/uuid"
import { db as fixtures, resetFixtures } from "@/server/fixtures/store"
import { createFixturesCatalogRepository } from "@/server/catalog/fixtures.repository"
import { createFixturesContentRepository } from "@/server/content/fixtures.repository"
import { createFixturesShippingRepository } from "@/server/shipping/fixtures.repository"
import { createFixturesPromotionRepository } from "@/server/promotions/fixtures.repository"
import { createFixturesPricingRepository } from "@/server/pricing/fixtures.repository"
import { createMysqlCatalogRepository } from "@/server/catalog/mysql.repository"
import { createMysqlContentRepository } from "@/server/content/mysql.repository"
import { createMysqlShippingRepository } from "@/server/shipping/mysql.repository"
import { createMysqlPromotionRepository } from "@/server/promotions/mysql.repository"
import { createMysqlPricingRepository } from "@/server/pricing/mysql.repository"
import type { Product } from "@/server/catalog/types"
import type { HomeContent } from "@/server/content/home-types"
import { homeSeed } from "@/server/fixtures/home-seed"
import { engines } from "./connections"

// One set of assertions exercises the behavioral reference and both real engines.
for (const [engine, config] of [["fixtures", null] as const, ...engines] as const) describe(engine + " catalogue/content/money contract", () => {
  const storeId = uuidv7(), brandId = uuidv7(), collectionId = uuidv7(), productId = uuidv7(), variantId = uuidv7(), priceListId = uuidv7()
  const actor = systemActor(storeId, "migration", ALL_PERMISSIONS)
  const fixture = engine === "fixtures"
  const catalog = fixture ? createFixturesCatalogRepository() : null
  const content = fixture ? createFixturesContentRepository() : null
  const shipping = fixture ? createFixturesShippingRepository() : null
  const promotion = fixture ? createFixturesPromotionRepository() : null
  const pricing = fixture ? createFixturesPricingRepository() : null
  const mysqlCatalog = createMysqlCatalogRepository(), mysqlContent = createMysqlContentRepository(), mysqlShipping = createMysqlShippingRepository(), mysqlPromotion = createMysqlPromotionRepository(), mysqlPricing = createMysqlPricingRepository()
  let saved: Product
  beforeAll(async () => {
    if (fixture) {
      resetFixtures()
      Object.assign(fixtures(), { brands: [], products: [], collections: [], shippingZones: [], taxRates: [], promotions: [], home: null, pages: [], faqs: [], newsletter: [], priceLists: [{ id: priceListId, code: "contract-pkr", currency: "PKR", customerGroup: null, priority: 0, startsAt: null, endsAt: null }], prices: [] })
    } else {
      await closeDatabase()
      process.env.DATABASE_URL = config!.appUrl
      const db = await database()
      await db.insert(stores).values({ id: storeId, name: "Contract store" })
      await db.insert(priceLists).values({ id: priceListId, storeId, code: "contract-pkr", currency: "PKR" })
    }
  })
  afterAll(async () => {
    if (!fixture) {
      try {
        const db = await database()
        await db.delete(storefrontContent).where(eq(storefrontContent.storeId, storeId))
        await db.delete(stores).where(eq(stores.id, storeId))
      } finally { await closeDatabase() }
    }
  })

  it("creates a brand and collection and preserves the full product DTO", async () => {
    const brand = { id: brandId, slug: "contract-brand", name: "Contract brand", position: 2 }
    expect(await (catalog ? catalog.createBrand(storeId, brand) : mysqlCatalog.createBrand(actor, storeId, brand))).toEqual(brand)
    const collection = { id: collectionId, storeId, slug: "contract-collection", title: "Contract collection", headline: ["Contract", "collection"] as [string, string], description: "Description", kind: "manual" as const, rules: [], image: null, position: 1, seo: {} }
    expect(await (catalog ? catalog.saveCollection(storeId, collection, null) : mysqlCatalog.saveCollection(actor, storeId, collection, null))).toEqual(collection)
    const extra = [{ ...collection, id: uuidv7(), slug: "z-contract" }, { ...collection, id: uuidv7(), slug: "a-contract" }]
    for (const row of extra) await (catalog ? catalog.saveCollection(storeId, row, null) : mysqlCatalog.saveCollection(actor, storeId, row, null))
    const input: Product = { id: productId, storeId, slug: "contract-shoe", title: "Contract shoe", brand, kind: "new", gender: "unisex", status: "draft", description: "Retained description", condition: null, conditionNotes: null, images: [{ url: "/images/contract.webp", alt: "Shoe", width: 800, height: 600, role: "card" }], variants: [{ id: variantId, sku: "CONTRACT-SKU-" + storeId, size: { eu: "42", uk: "8", us: "9", cm: "27" }, attributes: { colour: "Blue", recycled: true }, weightGrams: 400, position: 0 }], attributes: { material: "Leather", rating: 4.5, features: ["Light", "Durable"] }, customFields: { owner: "Preserved" }, collections: [collection.slug], tags: ["Contract", "demo"], position: 7, publishedAt: "2026-01-01T00:00:00.000Z", seo: { title: "SEO title" } }
    input.collections = [extra[0].slug, collection.slug, extra[1].slug]
    saved = await (catalog ? catalog.saveProduct(storeId, input, null) : mysqlCatalog.saveProduct(actor, storeId, input, null))
    expect(saved).toMatchObject(input)
    expect(await (catalog ? catalog.getProductBySlug(storeId, input.slug) : mysqlCatalog.getProductBySlug(actor, storeId, input.slug))).toBeNull()
    expect(await (catalog ? catalog.collectionProductIds(storeId, collectionId) : mysqlCatalog.collectionProductIds(actor, storeId, collectionId))).toEqual([productId])
  })

  it("publishes, searches by SKU, projects attributes and refuses stale edits", async () => {
    const previous = saved.updatedAt!
    saved = await (catalog ? catalog.saveProduct(storeId, { ...saved, status: "active" }, previous) : mysqlCatalog.saveProduct(actor, storeId, { ...saved, status: "active" }, previous))
    expect(await (catalog ? catalog.getProductBySlug(storeId, saved.slug) : mysqlCatalog.getProductBySlug(actor, storeId, saved.slug))).toEqual(saved)
    const query = { q: saved.variants[0].sku, page: 1, pageSize: 10 }
    expect((await (catalog ? catalog.searchProducts(storeId, query) : mysqlCatalog.searchProducts(actor, storeId, query))).total).toBe(1)
    await expect(catalog ? catalog.saveProduct(storeId, saved, previous) : mysqlCatalog.saveProduct(actor, storeId, saved, previous)).rejects.toMatchObject({ code: "conflict" })
    if (!fixture) {
      const { productAttributeValues } = await import("@/server/db/schema")
      const db = await database()
      expect((await db.select().from(productAttributeValues).where(and(eq(productAttributeValues.productId, productId), eq(productAttributeValues.attributeKey, "features")))).map((row) => row.valueText).sort()).toEqual(["Durable", "Light"])
    }
  })

  it("prices the same variant and replaces prices without losing minor units", async () => {
    const values = [{ priceListId, variantId, amount: 123456789, compareAt: 140000000 }]
    expect(await (pricing ? pricing.upsertPrices(values) : mysqlPricing.upsertPrices(actor, values))).toBe(1)
    expect(await (pricing ? pricing.listPrices([variantId]) : mysqlPricing.listPrices(actor, [variantId]))).toEqual(values)
    expect((await (pricing ? pricing.listPriceLists(storeId) : mysqlPricing.listPriceLists(actor, storeId)))[0].currency).toBe("PKR")
  })

  it("keeps shipping countries/cities/rates and replaces tax configuration", async () => {
    const zone = { id: uuidv7(), name: "Contract shipping", countries: ["PK"], cities: ["Karachi", "Lahore"], position: 0, rates: [{ code: "standard", label: "Standard", amount: 25000, freeOver: 1200000, minDays: 2, maxDays: 5, cashOnDelivery: true }, { code: "express", label: "Express", amount: 60000, freeOver: null, minDays: 1, maxDays: 2, cashOnDelivery: true }] }
    expect(await (shipping ? shipping.saveZone(storeId, zone) : mysqlShipping.saveZone(actor, storeId, zone))).toEqual(zone)
    expect(await (shipping ? shipping.listZones(storeId) : mysqlShipping.listZones(actor, storeId))).toEqual([zone])
    const taxes = [{ country: "PK", province: null, label: "GST", basisPoints: 1800, inclusive: true }]
    expect(await (shipping ? shipping.replaceTaxRates(storeId, taxes) : mysqlShipping.replaceTaxRates(actor, storeId, taxes))).toEqual(taxes)
    expect(await (shipping ? shipping.listTaxRates(storeId) : mysqlShipping.listTaxRates(actor, storeId))).toEqual(taxes)
    await (shipping ? shipping.deleteZone(storeId, zone.id) : mysqlShipping.deleteZone(actor, storeId, zone.id))
    expect(await (shipping ? shipping.listZones(storeId) : mysqlShipping.listZones(actor, storeId))).toEqual([])
  })

  it("preserves promotion conditions and never lets an editor overwrite redemption counters", async () => {
    const input = { id: uuidv7(), storeId, code: "CONTRACT", title: "Contract", conditions: [{ type: "first_order" as const }], actions: [{ type: "percent_off_order" as const, basisPoints: 1000 }], startsAt: null, endsAt: null, usageLimit: 2, perCustomerLimit: 1, timesUsed: 0, active: true, combinable: false }
    expect(await (promotion ? promotion.save(input) : mysqlPromotion.save(actor, input))).toEqual(input)
    expect(await (promotion ? promotion.save({ ...input, timesUsed: 999 }) : mysqlPromotion.save(actor, { ...input, timesUsed: 999 }))).toEqual(input)
    expect(await (promotion ? promotion.listActive(storeId) : mysqlPromotion.listActive(actor, storeId))).toEqual([input])
    await (promotion ? promotion.remove(storeId, input.id) : mysqlPromotion.remove(actor, storeId, input.id))
  })

  it("saves homepage and rejects stale or simultaneous first saves", async () => {
    const home = structuredClone(homeSeed) as HomeContent
    const first = await (content ? content.saveHome(storeId, home, null) : mysqlContent.saveHome(actor, storeId, home, null))
    expect(first.content).toEqual(home)
    expect(await (content ? content.home(storeId) : mysqlContent.home(actor, storeId))).toEqual(first)
    await expect(content ? content.saveHome(storeId, home, null) : mysqlContent.saveHome(actor, storeId, home, null)).rejects.toMatchObject({ code: "conflict" })
  })

  it("keeps page drafts private, renames safely and rejects stale content", async () => {
    const input = { slug: "contract-page", title: "Contract page", description: "Description", blocks: [{ type: "paragraph" as const, text: "Content" }], seo: { noindex: true }, published: false, updatedAt: "2026-01-01T00:00:00.000Z" }
    const created = await (content ? content.savePage(storeId, input, null, null) : mysqlContent.savePage(actor, storeId, input, null, null))
    expect(await (content ? content.getPage(storeId, input.slug) : mysqlContent.getPage(actor, storeId, input.slug))).toBeNull()
    const published = await (content ? content.savePage(storeId, { ...created, published: true, slug: "contract-renamed" }, created.slug, created.updatedAt) : mysqlContent.savePage(actor, storeId, { ...created, published: true, slug: "contract-renamed" }, created.slug, created.updatedAt))
    expect(await (content ? content.getPage(storeId, published.slug) : mysqlContent.getPage(actor, storeId, published.slug))).toEqual(published)
    await expect(content ? content.savePage(storeId, published, published.slug, input.updatedAt) : mysqlContent.savePage(actor, storeId, published, published.slug, input.updatedAt)).rejects.toMatchObject({ code: "conflict" })
    await (content ? content.deletePage(storeId, published.slug) : mysqlContent.deletePage(actor, storeId, published.slug))
  })

  it("subscribes once, unsubscribes, keeps FAQ order and deletes product/collection", async () => {
    const subscriber = { email: "contract@example.test", status: "subscribed" as const, source: "contract", consentAt: "2026-01-01T00:00:00.000Z" }
    expect(await (content ? content.subscribe(storeId, subscriber) : mysqlContent.subscribe(actor, storeId, subscriber))).toBe(true)
    expect(await (content ? content.subscribe(storeId, subscriber) : mysqlContent.subscribe(actor, storeId, subscriber))).toBe(false)
    await (content ? content.unsubscribe(storeId, subscriber.email) : mysqlContent.unsubscribe(actor, storeId, subscriber.email))
    expect((await (content ? content.listSubscribers(storeId, { page: 1, pageSize: 10 }) : mysqlContent.listSubscribers(actor, storeId, { page: 1, pageSize: 10 }))).subscribers[0].status).toBe("unsubscribed")
    const faq = { id: uuidv7(), category: "contract", question: "Question?", answer: "Answer", position: 0 }
    expect(await (content ? content.saveFaq(storeId, faq) : mysqlContent.saveFaq(actor, storeId, faq))).toEqual(faq)
    expect(await (content ? content.listFaqs(storeId) : mysqlContent.listFaqs(actor, storeId))).toEqual([faq])
    await (content ? content.deleteFaq(storeId, faq.id) : mysqlContent.deleteFaq(actor, storeId, faq.id))
    await (catalog ? catalog.deleteProduct(storeId, productId) : mysqlCatalog.deleteProduct(actor, storeId, productId))
    await (catalog ? catalog.deleteCollection(storeId, collectionId) : mysqlCatalog.deleteCollection(actor, storeId, collectionId))
    expect(await (catalog ? catalog.getProductById(storeId, productId) : mysqlCatalog.getProductById(actor, storeId, productId))).toBeNull()
  })
})
