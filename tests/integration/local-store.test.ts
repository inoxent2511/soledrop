import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import sharp from "sharp"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ALL_PERMISSIONS } from "@/server/admin/permissions"
import type { StaffContext } from "@/server/admin/types"
import { catalogRepository, staffCatalog } from "@/server/catalog"
import { contentRepository, staffContent } from "@/server/content"
import { emptyHome } from "@/server/content/home-types"
import { LocalStore } from "@/server/db/local-store"
import { closeLocalStore, localStore } from "@/server/fixtures/store"
import { createLocalTables } from "@/server/fixtures/store"
import { restorePreviewMetadata } from "@/server/db/migrate-catalogue"
import { mediaService } from "@/server/media"
import { serverEnv } from "@/lib/env.server"

const directories: string[] = []
const temporary = () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "soledrop-store-")); directories.push(directory); return directory }
const original = { driver: serverEnv.DATA_DRIVER, directory: serverEnv.LOCAL_DATA_DIR }
const stores: LocalStore<unknown>[] = []
afterEach(async () => {
  await closeLocalStore()
  for (const store of stores.splice(0)) await store.close()
  serverEnv.DATA_DRIVER = original.driver; serverEnv.LOCAL_DATA_DIR = original.directory
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe("saved local store", () => {
  it("restores audited settings and stock history idempotently without changing on-hand balances", () => {
    const tables = createLocalTables()
    tables.inventory.push({ variantId: "imported-size", onHand: 15, reserved: 0 })
    tables.audit.push(
      { id: "movement-audit", at: "2026-11-07T00:00:00Z", actor: "staff", action: "inventory.adjust", entity: "variant", entityId: "imported-size", before: { onHand: 0 }, after: { onHand: 15, reason: "Received from supplier" } },
      { id: "flag-audit", at: "2026-11-07T00:00:01Z", actor: "staff", action: "flag.changed", entity: "flag", entityId: "express-delivery", before: { enabled: true }, after: { enabled: false, customerGroups: null } },
    )
    expect(restorePreviewMetadata(tables)).toEqual({ movements: 1 })
    expect(restorePreviewMetadata(tables)).toEqual({ movements: 0 })
    expect(tables.inventory[0].onHand).toBe(15)
    expect(tables.inventoryMovements[0]).toMatchObject({ variantId: "imported-size", delta: 15, actor: "staff", reason: "Recovered preview audit: Received from supplier" })
    expect(tables.flags.find((flag) => flag.key === "express-delivery")?.enabled).toBe(false)
  })
  it("keeps the previous committed snapshot when a disk replacement fails", async () => {
    const directory = temporary()
    const first = new LocalStore(directory, () => ({ count: 7 }))
    stores.push(first)
    const failure = vi.spyOn(fs, "renameSync").mockImplementationOnce(() => { throw new Error("disk replacement failed") })
    try { await expect(first.run((state) => { state.count = 99 })).rejects.toThrow("disk replacement failed") }
    finally { failure.mockRestore() }
    expect(first.value.count).toBe(7)
    await first.close()
    const reopened = new LocalStore(directory, () => ({ count: -1 }))
    stores.push(reopened)
    expect(reopened.value.count).toBe(7)
    expect(fs.readdirSync(directory).filter((file) => file.endsWith(".tmp"))).toEqual([])
  })
  it("serializes concurrent operations, rolls back errors, and never reseeds on restart", async () => {
    const directory = temporary()
    const first = new LocalStore(directory, () => ({ count: 0, map: new Map([["token", { status: 201 }]]) }))
    stores.push(first)
    await Promise.all(Array.from({ length: 20 }, () => first.run(async (state) => { const before = state.count; await Promise.resolve(); state.count = before + 1 })))
    await expect(first.run((state) => { state.count = -1; throw new Error("cancel") })).rejects.toThrow("cancel")
    expect(first.value.count).toBe(20)
    await first.close()
    const restarted = new LocalStore<typeof first.value>(directory, () => { throw new Error("must not reseed") })
    stores.push(restarted)
    expect(restarted.value.count).toBe(20)
    expect(restarted.value.map.get("token")).toEqual({ status: 201 })
  })

  it("refuses another writer and refuses to reset a corrupt saved file", async () => {
    const directory = temporary()
    const first = new LocalStore(directory, () => ({ saved: true }))
    stores.push(first)
    expect(() => new LocalStore(directory, () => ({}))).toThrow()
    await first.close()
    const file = path.join(directory, "store.bin")
    fs.writeFileSync(file, "damaged snapshot")
    expect(() => new LocalStore(directory, () => ({ saved: false }))).toThrow()
    expect(fs.readFileSync(file, "utf8")).toBe("damaged snapshot")
    expect(fs.existsSync(path.join(directory, "store.lock"))).toBe(false)
  })

  it("persists admin uploads, product publishing, homepage content and deletion across restarts", async () => {
    serverEnv.DATA_DRIVER = "local"; serverEnv.LOCAL_DATA_DIR = temporary()
    const storeId = serverEnv.STORE_ID
    const staff: StaffContext = { member: { userId: "local-owner", storeId, email: "owner@example.com", displayName: "Owner", status: "active", totpEnabledAt: new Date().toISOString() }, session: { id: "local-session", aal: 2, mfaAt: new Date().toISOString(), createdAt: new Date().toISOString(), expiresAt: "2099-01-01T00:00:00Z" }, roles: [], permissions: [...ALL_PERMISSIONS], refundLimit: null }
    const meta = { ip: "127.0.0.1", userAgent: "test", requestId: "local-test" }
    expect(await catalogRepository().listProducts(storeId)).toEqual([])
    expect(await contentRepository().home(storeId)).toBeNull()
    const bytes = new Uint8Array(await sharp({ create: { width: 40, height: 30, channels: 3, background: "white" } }).png().toBuffer())
    const image = await mediaService().upload(staff, meta, { name: "new-shoe.png", bytes }, "White shoe")
    const uploadedBytes = (await mediaService().file(image.id))!.data
    const brand = await staffCatalog().createBrand(staff, meta, "Saved brand")
    const product = await staffCatalog().saveProduct(staff, meta, { title: "Saved shoe", slug: "saved-shoe", brandId: brand.id, kind: "new", gender: "unisex", condition: null, conditionNotes: null, description: "Uploaded through admin", images: [{ url: image.url, alt: image.alt, width: image.width, height: image.height, role: "card" }], variants: [{ sku: "LOCAL-42", size: { eu: "42", uk: "8", us: "9", cm: "27" }, weightGrams: 900, price: 100000, compareAt: null }], tags: [], collections: [], seo: {} }, {})
    await staffCatalog().setStatus(staff, meta, product.id, "active", product.updatedAt)
    const home = await staffContent().saveHome(staff, meta, { ...structuredClone(emptyHome), announcement: "Saved announcement", slides: [{ src: image.url, alt: image.alt }] }, null)
    await closeLocalStore()
    expect((await catalogRepository().getProductBySlug(storeId, "saved-shoe"))?.title).toBe("Saved shoe")
    expect((await contentRepository().home(storeId))?.content.announcement).toBe("Saved announcement")
    expect((await mediaService().file(image.id))?.data).toEqual(uploadedBytes)
    expect((await mediaService().file(image.id))?.data.length).toBe(image.bytes)
    await expect(mediaService().remove(staff, meta, image.id)).rejects.toMatchObject({ code: "conflict" })
    await staffCatalog().deleteProduct(staff, meta, product.id, null)
    // Homepage alone must also prevent media deletion.
    await expect(mediaService().remove(staff, meta, image.id)).rejects.toMatchObject({ code: "conflict" })
    await staffContent().saveHome(staff, meta, structuredClone(emptyHome), home.updatedAt)
    await mediaService().remove(staff, meta, image.id)
    await closeLocalStore()
    expect(await catalogRepository().listProducts(storeId)).toEqual([])
    expect(await mediaService().file(image.id)).toBeNull()
    expect(localStore().value.products).toHaveLength(0)
  })
})
