import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { ALL_PERMISSIONS } from "@/server/admin/permissions"
import { createFixturesCatalogRepository } from "@/server/catalog/fixtures.repository"
import { createMysqlCatalogRepository, reindexCatalogueSearch } from "@/server/catalog/mysql.repository"
import { createMysqlStorefrontRepository } from "@/server/catalog/storefront.mysql.repository"
import { createCatalogService } from "@/server/catalog/service"
import type { CatalogOperations } from "@/server/catalog/repository"
import type { Collection, Product, ProductQuery } from "@/server/catalog/types"
import { createFixturesInventoryRepository } from "@/server/inventory/fixtures.repository"
import { createMysqlInventoryRepository } from "@/server/inventory/mysql.repository"
import type { InventoryOperations } from "@/server/inventory/repository"
import { createFixturesPricingRepository } from "@/server/pricing/fixtures.repository"
import { createMysqlPricingRepository } from "@/server/pricing/mysql.repository"
import type { PricingOperations } from "@/server/pricing/repository"
import { applicablePriceLists, createPricingService } from "@/server/pricing/service"
import type { PriceList } from "@/server/pricing/types"
import { anonymousActor, systemActor } from "@/server/db/actor"
import { bindActor } from "@/server/db/bind"
import { closeDatabase, database, withTransaction } from "@/server/db/client"
import { priceLists, stores } from "@/server/db/schema"
import { uuidv7, uuidToBytes } from "@/server/db/uuid"
import { db, resetFixtures } from "@/server/fixtures/store"
import { connect, engines } from "./connections"
import { catalogueRevision } from "@/server/catalog/facet-cache.repository"

for (const [engine, config] of engines) describe(engine + " indexed storefront parity", () => {
  const storeId = uuidv7(), worker = systemActor(storeId, "migration", ALL_PERMISSIONS), visitor = anonymousActor(storeId)
  const fixtureCatalog = bindActor<CatalogOperations>(createFixturesCatalogRepository(), () => worker), mysqlCatalog = bindActor<CatalogOperations>(createMysqlCatalogRepository(), () => worker)
  const fixturePricing = bindActor<PricingOperations>(createFixturesPricingRepository(), () => worker), mysqlPricing = bindActor<PricingOperations>(createMysqlPricingRepository(), () => worker)
  const fixtureInventory = bindActor<InventoryOperations>(createFixturesInventoryRepository(), () => worker), mysqlInventory = bindActor<InventoryOperations>(createMysqlInventoryRepository(), () => worker)
  const native = createMysqlStorefrontRepository(), pricing = createPricingService(mysqlPricing)
  const synonyms = new Map([["trainers", ["sneaker", "running shoe"]]])
  const reference = createCatalogService({ catalog: fixtureCatalog, pricing: createPricingService(fixturePricing), inventory: fixtureInventory, synonyms: async () => synonyms })
  const resolved = createCatalogService({ catalog: mysqlCatalog, pricing, inventory: mysqlInventory })
  const brands = [{ id: uuidv7(), name: "Nike", slug: "nike", position: 0 }, { id: uuidv7(), name: "New Balance", slug: "new-balance", position: 1 }]
  const at = new Date().toISOString(), productIds = Array.from({ length: 9 }, () => uuidv7())
  const samples: Product[] = ["Dúnk Lów", "Air Max", "Heritage Sneaker", "Runner", "Unpriced", "X".repeat(150), "Straße", "STRASSE", "𠮷".repeat(75)].map((title, position) => ({
    id: productIds[position], storeId, slug: "parity-" + position, title, brand: brands[position % 2], kind: position === 3 ? "preloved" : "new", gender: position === 2 ? "unisex" : position === 3 ? "women" : "men", status: "active", description: position === 0 ? "Bright red running shoe" : "Classic white pair", condition: position === 3 ? "excellent" : null, conditionNotes: null, images: [],
    variants: [42, 43].map((size, index) => ({ id: uuidv7(), sku: "PARITY-" + storeId.slice(-12) + "-" + position + "-" + size, size: { eu: String(size), uk: "8", us: "9", cm: "27" }, attributes: {}, weightGrams: 900, position: index })),
    attributes: { color: position === 0 ? "red" : "white" }, customFields: {}, collections: [], tags: position === 1 ? ["retro"] : [], position, publishedAt: at, seo: {},
  }))
  const lists: PriceList[] = [{ id: uuidv7(), code: "base", currency: "PKR", customerGroup: null, priority: 0, startsAt: null, endsAt: null }, { id: uuidv7(), code: "wholesale", currency: "PKR", customerGroup: "wholesale", priority: 20, startsAt: null, endsAt: null }]
  const groups: Collection[] = [
    { id: uuidv7(), storeId, slug: "manual", title: "Manual", headline: ["Manual", "Pairs"], description: "", kind: "manual", rules: [], image: null, position: 0, seo: {} },
    { id: uuidv7(), storeId, slug: "sale", title: "Sale", headline: ["Sale", "Pairs"], description: "", kind: "rule", rules: [{ field: "onSale", equals: true }], image: null, position: 1, seo: {} },
    { id: uuidv7(), storeId, slug: "recent", title: "Recent", headline: ["Recent", "Pairs"], description: "", kind: "rule", rules: [{ field: "kind", equals: "new" }, { field: "publishedWithinDays", days: 19 }], image: null, position: 2, seo: {} },
    { id: uuidv7(), storeId, slug: "retro", title: "Retro", headline: ["Retro", "Pairs"], description: "", kind: "rule", rules: [{ field: "tag", equals: "retro" }, { field: "gender", in: ["men"] }], image: null, position: 3, seo: {} },
    { id: uuidv7(), storeId, slug: "case-tag", title: "Case-sensitive tag", headline: ["Tagged", "Pairs"], description: "", kind: "rule", rules: [{ field: "tag", equals: "RETRO" }], image: null, position: 4, seo: {} },
  ]
  beforeAll(async () => {
    resetFixtures(); db().stores[0].id = storeId
    Object.assign(db(), { brands: [], products: [], collections: [], inventory: [], prices: [], priceLists: structuredClone(lists), inventoryMovements: [] })
    await closeDatabase(); process.env.DATABASE_URL = config.appUrl
    const connection = await database()
    await connection.insert(stores).values({ id: storeId, name: "Storefront parity" })
    await connection.insert(priceLists).values(lists.map((list) => ({ ...list, storeId })))
    for (const catalog of [fixtureCatalog, mysqlCatalog]) {
      for (const brand of brands) await catalog.createBrand(storeId, brand)
      for (const product of samples) await catalog.saveProduct(storeId, structuredClone(product), null)
      for (const group of groups) await catalog.saveCollection(storeId, group, group.kind === "manual" ? [samples[0].id, samples[2].id] : null)
    }
    const rows = samples.slice(0, 4).flatMap((product, position) => product.variants.map((variant, index) => ({ priceListId: lists[0].id, variantId: variant.id, amount: 10000 + position * 1000 + index * 500, compareAt: position === 0 ? 15000 : null })))
    rows.push({ priceListId: lists[1].id, variantId: samples[0].variants[0].id, amount: 9000, compareAt: null })
    for (const repository of [fixturePricing, mysqlPricing]) await repository.upsertPrices(rows)
    for (const inventory of [fixtureInventory, mysqlInventory]) for (const product of samples.filter((_, index) => index !== 3)) for (const variant of product.variants) await inventory.adjust(variant.id, 3, "Query contract opening stock", "migration")
  })
  afterAll(async () => {
    const maintenance = await connect(config.migratorUrl)
    try {
      await maintenance.execute("DELETE m FROM inventory_movements m INNER JOIN variants v ON v.id = m.variant_id INNER JOIN products p ON p.id = v.product_id WHERE p.store_id = ?", [uuidToBytes(storeId)])
      await maintenance.execute("DELETE FROM products WHERE store_id = ?", [uuidToBytes(storeId)])
      await maintenance.execute("DELETE FROM stores WHERE id = ?", [uuidToBytes(storeId)])
    } finally { await maintenance.end(); await closeDatabase() }
  })
  const cases: ProductQuery[] = [
    {}, ...["featured", "title-asc", "title-desc", "newest", "oldest", "price-asc", "price-desc", "discount-desc"].map((sort) => ({ sort } as ProductQuery)),
    { page: 2, pageSize: 2 }, { page: 999, pageSize: 2 }, { gender: ["men"] }, { gender: ["women"], sizes: ["42"] }, { brands: ["nike"], priceMin: 11000 }, { brands: ["NIKE"] }, { priceMax: 12000 }, { condition: ["excellent"] }, { kind: "preloved" }, { excludeIds: [samples[0].id] },
    ...["manual", "sale", "recent", "retro", "case-tag", "missing"].map((collection) => ({ collection })),
    ...["nike", "dunk", "dukn", "dun", "red dunk", "trainers", "42", samples[0].variants[0].sku, "nonexistent", "!!!", "running", "runnign", "new balance", "xxxxxxxxxx", "nike' OR 1=1; --", "strasse", "straße", "𠮷𠮷𠮷"].map((q) => ({ q })),
  ]
  for (const customerGroup of [null, "wholesale"]) it.each(cases.map((query) => ({ query, label: JSON.stringify(query) })))(String(customerGroup) + " $label", async ({ query }) => {
    const context = { storeId, customerGroup }, expected = await reference.queryProducts(query, context)
    const selected = await native.selectPage(visitor, storeId, query, applicablePriceLists(await mysqlPricing.listPriceLists(storeId), context).map((list) => list.id), groups.find((group) => group.slug === query.collection), synonyms)
    expect({ total: selected.total, page: selected.page, pageCount: selected.pageCount, facets: selected.facets }).toEqual({ total: expected.total, page: expected.page, pageCount: expected.pageCount, facets: expected.facets })
    const withoutVersion = (items: typeof expected.items) => items.map(({ updatedAt: _updated, ...item }) => item)
    expect(withoutVersion(await resolved.enrich(selected.products, context))).toEqual(withoutVersion(expected.items))
  })
  it("preserves vocabulary order and rebuilds projections without changing product versions", async () => {
    expect(await native.vocabulary(visitor, storeId)).toEqual(await reference.vocabulary(storeId))
    const before = await mysqlCatalog.listProducts(storeId)
    expect((await reindexCatalogueSearch(worker)).count).toBe(9)
    expect(await mysqlCatalog.listProducts(storeId)).toEqual(before)
    expect(await native.vocabulary(visitor, storeId)).toEqual(await reference.vocabulary(storeId))
  })
  it("selects related pairs without scanning/hydrating the full catalogue", async () => {
    const context = { storeId, customerGroup: null }, product = (await reference.queryProducts({}, context)).items[0]
    const expected = await reference.related(product, context, 3)
    expect((await native.related(visitor, storeId, product, 3)).map((row) => row.id)).toEqual(expected.map((row) => row.id))
  })
  it("keeps unique size facets and tied/changed price heads correct, including a rolled-back price write", async () => {
    const special: Product = { ...structuredClone(samples[0]), id: uuidv7(), slug: "projection-tie", title: "Projection tie", position: 20, variants: [0, 1, 2].map((position) => ({ ...structuredClone(samples[0].variants[0]), id: uuidv7(), sku: "PROJECTION-" + storeId.slice(-12) + "-" + position, position, size: { eu: position < 2 ? "42" : "43", uk: "8", us: "9", cm: "27" } })) }
    for (const catalog of [fixtureCatalog, mysqlCatalog]) await catalog.saveProduct(storeId, structuredClone(special), null)
    const initial = special.variants.map((variant, position) => ({ variantId: variant.id, priceListId: lists[0].id, amount: position < 2 ? 3000 : 5000, compareAt: position === 0 ? 6000 : null }))
    for (const repository of [fixturePricing, mysqlPricing]) await repository.upsertPrices(initial)
    const context = { storeId, customerGroup: null }, query = { q: "projection", collection: "sale" }
    const compareSelection = async () => {
      const expected = await reference.queryProducts(query, context)
      const selected = await native.selectPage(visitor, storeId, query, [lists[0].id], groups.find((group) => group.slug === "sale"), synonyms)
      expect(selected.total).toBe(expected.total)
      expect(selected.facets).toEqual(expected.facets)
      expect((await resolved.enrich(selected.products, context)).map((product) => product.price)).toEqual(expected.items.map((product) => product.price))
      return selected
    }
    const before = await compareSelection()
    expect(before.total).toBe(1)
    expect(before.facets.sizes).toEqual([{ value: "42", count: 1 }, { value: "43", count: 1 }])
    const change = { ...initial[1], amount: 1000 }
    for (const repository of [fixturePricing, mysqlPricing]) await repository.upsertPrices([change])
    expect((await compareSelection()).total).toBe(0)
    await expect(withTransaction(async () => {
      await mysqlPricing.upsertPrices([{ ...change, amount: 999, compareAt: 5000 }])
      throw new Error("Abort the complete price transaction")
    })).rejects.toThrow("Abort the complete price transaction")
    expect((await compareSelection()).total).toBe(0)
  })
  it("retains exact scoped search facets after edits, rollback, reindex and deletion", async () => {
    const originals = await mysqlCatalog.listProducts(storeId), term = "universalcoverageterm"
    const context = { storeId, customerGroup: null }, query = { q: term }
    const compare = async () => {
      const expected = await reference.queryProducts(query, context)
      const actual = await native.selectPage(visitor, storeId, query, [lists[0].id], undefined, synonyms)
      expect(actual.total).toBe(expected.total)
      expect(actual.facets).toEqual(expected.facets)
      expect(actual.products.map((row) => row.id)).toEqual(expected.items.map((row) => row.id))
    }
    try {
      for (const repository of [fixtureCatalog, mysqlCatalog]) for (const product of originals) await repository.saveProduct(storeId, { ...product, tags: [...product.tags, term] }, null)
      const revision = await catalogueRevision(await database(), worker)
      await compare()
      await expect(withTransaction(async () => {
        await mysqlCatalog.saveProduct(storeId, originals[0], null)
        throw new Error("Rollback vocabulary counts")
      })).rejects.toThrow("Rollback vocabulary counts")
      expect(await catalogueRevision(await database(), worker)).toBe(revision)
      await reindexCatalogueSearch(worker)
      expect(await catalogueRevision(await database(), worker)).toBeGreaterThan(revision)
      for (const repository of [fixtureCatalog, mysqlCatalog]) await repository.saveProduct(storeId, originals[0], null)
      await compare()
      const temporary = { ...structuredClone(originals[0]), id: uuidv7(), slug: "coverage-deletion", variants: [], tags: [term] }
      for (const repository of [fixtureCatalog, mysqlCatalog]) { await repository.saveProduct(storeId, temporary, null); await repository.deleteProduct(storeId, temporary.id) }
      await compare()
    } finally {
      for (const repository of [fixtureCatalog, mysqlCatalog]) for (const product of originals) await repository.saveProduct(storeId, product, null)
    }
  })
  it("invalidates committed facets without publishing rolled-back data or mutable cached DTOs", async () => {
    const read = () => native.selectPage(visitor, storeId, {}, [lists[0].id], undefined, synonyms)
    const first = await read(), expected = structuredClone(first.facets)
    first.facets.sizes[0].count = -999
    expect((await read()).facets).toEqual(expected)
    const before = await mysqlPricing.listPrices(samples[0].variants.map((row) => row.id))
    const changed = (amount: number) => samples[0].variants.map((row) => ({ priceListId: lists[0].id, variantId: row.id, amount, compareAt: null }))
    const revision = await catalogueRevision(await database(), worker)
    try {
      await expect(withTransaction(async () => {
        await mysqlPricing.upsertPrices(changed(50000))
        expect((await read()).facets.price.max).toBe(50000)
        throw new Error("Rollback cached facets")
      })).rejects.toThrow("Rollback cached facets")
      expect(await catalogueRevision(await database(), worker)).toBe(revision)
      expect((await read()).facets).toEqual(expected)
      for (const repository of [fixturePricing, mysqlPricing]) await repository.upsertPrices(changed(60000))
      const referencePage = await reference.queryProducts({}, { storeId, customerGroup: null })
      expect((await read()).facets).toEqual(referencePage.facets)
      expect((await read()).facets.price.max).toBe(60000)
    } finally { for (const repository of [fixturePricing, mysqlPricing]) await repository.upsertPrices(before) }
  })
})
