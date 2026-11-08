import { afterAll, beforeAll, describe, expect, it } from "vitest"
import sharp from "sharp"
import { eq } from "drizzle-orm"
import { ALL_PERMISSIONS } from "@/server/admin/permissions"
import type { MediaOperations } from "@/server/media/repository"
import { createFixturesMediaRepository } from "@/server/media/fixtures.repository"
import { createMysqlMediaRepository } from "@/server/media/mysql.repository"
import { systemActor } from "@/server/db/actor"
import { bindActor } from "@/server/db/bind"
import { closeDatabase, database, withTransaction } from "@/server/db/client"
import { products, stores, storefrontContent } from "@/server/db/schema"
import { uuidv7 } from "@/server/db/uuid"
import { db as fixtures, resetFixtures } from "@/server/fixtures/store"
import { engines } from "./connections"
import { createFixturesCatalogRepository } from "@/server/catalog/fixtures.repository"
import { createMysqlCatalogRepository } from "@/server/catalog/mysql.repository"
import { createFixturesContentRepository } from "@/server/content/fixtures.repository"
import { createMysqlContentRepository } from "@/server/content/mysql.repository"
import type { CatalogOperations } from "@/server/catalog/repository"
import type { ContentOperations } from "@/server/content/repository"
import { products as sampleProducts } from "@/server/fixtures/seed"
import { emptyHome } from "@/server/content/home-types"
import { createMediaService } from "@/server/media/service"
import { fixtureAtomic } from "@/server/fixtures/atomic"
import type { StaffContext } from "@/server/admin/types"

for (const [engine, config] of [["fixtures", null] as const, ...engines] as const) describe(engine + " media contract", () => {
  const storeId = uuidv7(), actor = systemActor(storeId, "migration", ALL_PERMISSIONS), fixture = engine === "fixtures"
  const media: MediaOperations = bindActor<MediaOperations>(fixture ? createFixturesMediaRepository() : createMysqlMediaRepository(), () => actor)
  beforeAll(async () => {
    if (fixture) { resetFixtures(); fixtures().stores[0].id = storeId; fixtures().media = [] }
    else { await closeDatabase(); process.env.DATABASE_URL = config!.appUrl; await (await database()).insert(stores).values({ id: storeId, name: "Media contract" }) }
  })
  afterAll(async () => { if (!fixture) { try { const db = await database(); await db.delete(products).where(eq(products.storeId, storeId)); await db.delete(storefrontContent).where(eq(storefrontContent.storeId, storeId)); await db.delete(stores).where(eq(stores.id, storeId)) } finally { await closeDatabase() } } })
  it("inspects unpublished product and banner references using only media permission", async () => {
    const catalog = bindActor<CatalogOperations>(fixture ? createFixturesCatalogRepository() : createMysqlCatalogRepository(), () => actor)
    const content = bindActor<ContentOperations>(fixture ? createFixturesContentRepository() : createMysqlContentRepository(), () => actor)
    const id = uuidv7(), url = "/media/" + id + ".webp", brand = { id: uuidv7(), slug: "reference-brand", name: "Reference", position: 0 }
    await catalog.createBrand(storeId, brand)
    await catalog.saveProduct(storeId, { ...structuredClone(sampleProducts[0]), id: uuidv7(), storeId, slug: "private-draft", status: "draft", brand, variants: [], collections: [], images: [{ url, alt: "Draft image", width: 8, height: 8 }] }, null)
    const collection = { id: uuidv7(), storeId, slug: "reference-collection", title: "Reference", headline: ["Reference", "collection"] as [string, string], description: "", kind: "manual" as const, rules: [], image: { url, alt: "Banner", width: 8, height: 8 }, position: 0, seo: {} }
    await catalog.saveCollection(storeId, collection, [])
    const before = await content.home(storeId)
    await content.saveHome(storeId, { ...emptyHome, slides: [{ src: url, alt: "Homepage" }] }, before?.updatedAt ?? null)
    const reader = systemActor(storeId, "integration", ["media:read"])
    const raw = fixture ? createFixturesMediaRepository() : createMysqlMediaRepository()
    expect(await raw.usage(reader, storeId, url)).toEqual(["Product: private-draft", "Collection: reference-collection", "Homepage"])
    await expect(raw.usage(systemActor(storeId, "integration", []), storeId, url)).rejects.toMatchObject({ code: "forbidden" })
    const rawCatalog = fixture ? createFixturesCatalogRepository() : createMysqlCatalogRepository()
    await expect(rawCatalog.searchProducts(reader, storeId, { page: 1, pageSize: 10 })).rejects.toMatchObject({ code: "forbidden" })
    await expect(raw.usage(reader, uuidv7(), url)).rejects.toMatchObject({ code: "forbidden" })
  })
  it("keeps a staged upload inaccessible when its mandatory audit fails", async () => {
    const at = new Date().toISOString(), userId = uuidv7()
    const staff: StaffContext = { member: { userId, storeId, email: "media-test@example.test", displayName: "Media test", status: "active", totpEnabledAt: at }, session: { id: uuidv7(), aal: 2, mfaAt: at, createdAt: at, expiresAt: new Date(Date.now() + 60_000).toISOString() }, roles: [], permissions: ["media:read", "media:write"], refundLimit: 0 }
    const service = createMediaService({ media, usage: (store, url) => media.usage(store, url), atomic: fixture ? fixtureAtomic : (work) => withTransaction(work), audit: async () => { throw new Error("Simulated media audit failure") } })
    const before = (await media.list(storeId, { page: 1, pageSize: 100 })).total
    const bytes = new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 3, background: "blue" } }).png().toBuffer())
    await expect(service.upload(staff, { ip: "127.0.0.1", userAgent: "test", requestId: uuidv7() }, { name: "rollback.png", bytes })).rejects.toThrow("Simulated media audit failure")
    expect((await media.list(storeId, { page: 1, pageSize: 100 })).total).toBe(before)
  })
  it("stores image bytes, pages/searches metadata, replaces alt text and removes the public index", async () => {
    const data = new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).webp().toBuffer())
    const id = uuidv7(), input = { id, storeId, path: storeId + "/" + id + ".webp", filename: "contract.webp", mime: "image/webp" as const, bytes: data.length, width: 8, height: 8, alt: "Contract image", createdBy: null, createdAt: new Date().toISOString() }
    const saved = await media.create(input, data)
    expect(saved.id).toBe(id)
    expect(await media.read(saved.path)).toEqual(data)
    for (const format of ["webp", "avif"] as const) {
      const variant = await media.readVariant(saved.path, 640, format)
      expect(variant).not.toBeNull()
      expect((await sharp(variant!).metadata()).format).toBe(format === "avif" ? "heif" : "webp")
      expect((await sharp(variant!).metadata()).width).toBe(8)
    }
    await expect(media.readVariant(saved.path, 123, "webp")).rejects.toMatchObject({ code: "validation" })
    expect(await media.find(storeId, id)).toEqual(saved)
    expect(await media.findById(id)).toEqual(saved)
    expect((await media.list(storeId, { q: "contract", page: 1, pageSize: 1 })).items).toEqual([saved])
    expect((await media.updateAlt(storeId, id, "Updated alt")).alt).toBe("Updated alt")
    // A second upload of identical bytes remains a separate editable library item.
    const second = await media.create({ ...input, id: uuidv7(), path: storeId + "/" + uuidv7() + ".webp" }, data)
    expect(second.id).not.toBe(id)
    expect((await media.list(storeId, { page: 1, pageSize: 1 })).total).toBe(2)
    expect(await media.hasOrderUsage(storeId, "/media/" + id + ".webp")).toBe(false)
    await media.remove(storeId, id)
    expect(await media.findById(id)).toBeNull()
    expect(await media.read(saved.path)).toBeNull()
    expect(await media.readVariant(saved.path, 640, "avif")).toBeNull()
    await media.remove(storeId, second.id)
  })
})
