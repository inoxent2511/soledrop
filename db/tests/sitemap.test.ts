import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { eq, inArray } from "drizzle-orm"
import { anonymousActor } from "@/server/db/actor"
import { closeDatabase, database } from "@/server/db/client"
import { brands, collections, pages, productImages, products, stores } from "@/server/db/schema"
import { uuidv7 } from "@/server/db/uuid"
import { createMysqlSitemapRepository, SITEMAP_PAGE_SIZE } from "@/server/storefront/sitemap.repository"
import { engines } from "./connections"

for (const [engine, config] of engines) describe(engine + " bounded sitemap metadata", () => {
  const storeId = uuidv7(), otherStore = uuidv7(), brandId = uuidv7(), otherBrand = uuidv7()
  const visitor = anonymousActor(storeId), repository = createMysqlSitemapRepository()
  const ids = Array.from({ length: SITEMAP_PAGE_SIZE + 1 }, () => uuidv7()).sort()
  const modified = "2026-01-02 03:04:05.123"
  beforeAll(async () => {
    await closeDatabase(); process.env.DATABASE_URL = config.appUrl
    const db = await database()
    await db.insert(stores).values([{ id: storeId, name: "Sitemap" }, { id: otherStore, name: "Other sitemap" }])
    await db.insert(brands).values([{ id: brandId, storeId, slug: "brand", name: "Brand" }, { id: otherBrand, storeId: otherStore, slug: "brand", name: "Brand" }])
    const rows = ids.map((id, index) => ({ id, storeId, brandId, slug: "pair-" + index, title: "Pair", kind: "new", gender: "unisex", status: "active", publishedAt: modified }))
    for (let start = 0; start < rows.length; start += 250) await db.insert(products).values(rows.slice(start, start + 250))
    await db.insert(products).values([{ ...rows[0], id: uuidv7(), slug: "draft", status: "draft" }, { ...rows[0], id: uuidv7(), storeId: otherStore, brandId: otherBrand, slug: "other" }])
    await db.insert(productImages).values([{ id: uuidv7(), productId: ids[0], url: "/second.webp", width: 800, height: 600, position: 1 }, { id: uuidv7(), productId: ids[0], url: "/first.webp", width: 800, height: 600, position: 0 }])
    await db.insert(collections).values(["sale", "pre-loved", "brand-new"].map((slug) => ({ id: uuidv7(), storeId, slug, title: slug, kind: "manual" })))
    await db.insert(pages).values([
      { storeId, slug: "visible", title: "Visible", published: 1, updatedAt: modified },
      { storeId, slug: "indexable", title: "Indexable", published: 1, seo: { noindex: false } },
      { storeId, slug: "hidden", title: "Hidden", published: 1, seo: { noindex: true } },
      { storeId, slug: "draft", title: "Draft", published: 0 },
      { storeId: otherStore, slug: "other", title: "Other", published: 1 },
    ])
  })
  afterAll(async () => {
    const db = await database()
    await db.delete(products).where(inArray(products.storeId, [storeId, otherStore]))
    await db.delete(stores).where(inArray(stores.id, [storeId, otherStore]))
    await closeDatabase()
  })
  it("counts only this store's indexable entities", async () => {
    expect(await repository.counts(visitor, storeId)).toEqual({ products: SITEMAP_PAGE_SIZE + 1, collections: 1, pages: 2 })
    expect((await repository.page(visitor, storeId, "collections", 0)).map((row) => row.slug)).toEqual(["brand-new"])
    expect((await repository.page(visitor, storeId, "pages", 0)).map((row) => row.slug)).toEqual(["indexable", "visible"])
    await expect(repository.counts(visitor, otherStore)).rejects.toMatchObject({ code: "forbidden" })
    await expect(repository.page(visitor, otherStore, "products", 0)).rejects.toMatchObject({ code: "forbidden" })
  })
  it("splits at the exact boundary, keeps the primary image and never loads variants", async () => {
    const first = await repository.page(visitor, storeId, "products", 0), second = await repository.page(visitor, storeId, "products", 1)
    expect(first).toHaveLength(SITEMAP_PAGE_SIZE)
    expect(second).toEqual([{ slug: "pair-5000", modified: "2026-01-02T03:04:05.123Z", image: null }])
    expect(first[0]).toEqual({ slug: "pair-0", modified: "2026-01-02T03:04:05.123Z", image: "/first.webp" })
    expect(new Set([...first, ...second].map((row) => row.slug)).size).toBe(ids.length)
    expect(await repository.page(visitor, storeId, "products", 2)).toEqual([])
    await expect(repository.page(visitor, storeId, "products", -1)).rejects.toMatchObject({ code: "validation" })
    await (await database()).delete(pages).where(eq(pages.storeId, storeId))
    expect((await repository.counts(visitor, storeId)).pages).toBe(0)
  })
})
