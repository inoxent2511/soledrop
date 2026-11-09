import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { ALL_PERMISSIONS } from "@/server/admin/permissions"
import { anonymousActor, systemActor } from "@/server/db/actor"
import { bindActor } from "@/server/db/bind"
import { closeDatabase, database } from "@/server/db/client"
import { priceLists, products as productRows, stores } from "@/server/db/schema"
import { uuidv7 } from "@/server/db/uuid"
import { db, resetFixtures } from "@/server/fixtures/store"
import { createFixturesCatalogRepository } from "@/server/catalog/fixtures.repository"
import { createMysqlCatalogRepository } from "@/server/catalog/mysql.repository"
import { createMysqlStorefrontRepository } from "@/server/catalog/storefront.mysql.repository"
import { createCatalogService } from "@/server/catalog/service"
import type { CatalogOperations } from "@/server/catalog/repository"
import type { Product } from "@/server/catalog/types"
import { createFixturesPricingRepository } from "@/server/pricing/fixtures.repository"
import { createMysqlPricingRepository } from "@/server/pricing/mysql.repository"
import { createPricingService } from "@/server/pricing/service"
import type { PricingOperations } from "@/server/pricing/repository"
import { createFixturesInventoryRepository } from "@/server/inventory/fixtures.repository"
import type { InventoryOperations } from "@/server/inventory/repository"
import { engines } from "./connections"

for (const [engine, config] of engines) describe(engine + " indexed price page", () => {
  const storeId = uuidv7(), listId = uuidv7(), worker = systemActor(storeId, "migration", ALL_PERMISSIONS), visitor = anonymousActor(storeId)
  const fixtures = bindActor<CatalogOperations>(createFixturesCatalogRepository(), () => worker), native = bindActor<CatalogOperations>(createMysqlCatalogRepository(), () => worker)
  const fixturePrices = bindActor<PricingOperations>(createFixturesPricingRepository(), () => worker), nativePrices = bindActor<PricingOperations>(createMysqlPricingRepository(), () => worker)
  const reference = createCatalogService({ catalog: fixtures, pricing: createPricingService(fixturePrices), inventory: bindActor<InventoryOperations>(createFixturesInventoryRepository(), () => worker) })
  const storefront = createMysqlStorefrontRepository(), brand = { id: uuidv7(), slug: "price-page", name: "Price page", position: 0 }
  const list = { id: listId, code: "base", currency: "PKR" as const, customerGroup: null, priority: 0, startsAt: null, endsAt: null }
  const samples: Product[] = [20, 0, 10].map((position, index) => ({ id: uuidv7(), storeId, slug: "price-page-" + index, title: "Price page " + index, brand, kind: "new", gender: "unisex", status: "active", description: "", condition: null, conditionNotes: null, images: [], variants: [{ id: uuidv7(), sku: "PRICE-PAGE-" + uuidv7(), size: { eu: "42", uk: "8", us: "9", cm: "27" }, attributes: {}, weightGrams: 0, position: 0 }], attributes: {}, customFields: {}, collections: [], tags: [], position, publishedAt: new Date().toISOString(), seo: {} }))
  beforeAll(async () => {
    resetFixtures(); db().stores[0].id = storeId
    Object.assign(db(), { brands: [], products: [], collections: [], inventory: [], prices: [], priceLists: [list], inventoryMovements: [] })
    await closeDatabase(); process.env.DATABASE_URL = config.appUrl
    await (await database()).insert(stores).values({ id: storeId, name: "Price-page parity" })
    await (await database()).insert(priceLists).values({ ...list, storeId })
    for (const repository of [fixtures, native]) { await repository.createBrand(storeId, brand); for (const product of samples) await repository.saveProduct(storeId, structuredClone(product), null) }
    const prices = samples.map((product, index) => ({ variantId: product.variants[0].id, priceListId: listId, amount: index === 2 ? 2000 : 1000, compareAt: null }))
    for (const repository of [fixturePrices, nativePrices]) await repository.upsertPrices(prices)
  })
  afterAll(async () => {
    const connection = await database()
    await connection.delete(productRows).where(eq(productRows.storeId, storeId))
    await connection.delete(stores).where(eq(stores.id, storeId))
    await closeDatabase()
  })
  it("includes complete boundary-price ties and preserves position order before paging", async () => {
    for (const sort of ["price-asc", "price-desc"] as const) for (const page of [1, 2, 3, 99]) {
      const query = { sort, page, pageSize: 1 }, expected = await reference.queryProducts(query, { storeId, customerGroup: null })
      const actual = await storefront.selectPage(visitor, storeId, query, [listId], undefined, new Map())
      expect(actual.products.map((row) => row.id)).toEqual(expected.items.map((row) => row.id))
      expect(actual.facets).toEqual(expected.facets)
      expect(actual.page).toBe(expected.page)
    }
    expect((await storefront.selectPage(visitor, storeId, { sort: "price-asc", pageSize: 1 }, [listId], undefined, new Map())).products[0].id).toBe(samples[1].id)
  })
})
