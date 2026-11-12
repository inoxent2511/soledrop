import { currentActor } from "@/server/db/context"
import { bindActor } from "@/server/db/bind"
import type { MediaOperations } from "@/server/media/repository"
import { staffService } from "@/server/db/staff-service"
import { fixtureStaff } from "@/tests/helpers/staff"
import sharp from "sharp"
import { beforeEach, describe, expect, it } from "vitest"

import type { ProductInput } from "@/features/admin/products/schema"
import { type RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import { catalogRepository } from "@/server/catalog"
import { createStaffCatalog } from "@/server/catalog/staff"
import { STORE_ID } from "@/server/fixtures/seed"
import { db, resetFixtures } from "@/server/fixtures/store"
import { inventory } from "@/server/inventory"
import { createFixturesMediaRepository } from "@/server/media/fixtures.repository"
import { createMediaService, processImage, sniffImage } from "@/server/media/service"
import { pricing } from "@/server/pricing"

/** Staff catalogue and media (admin A3) on the fixtures driver. */

const meta: RequestMeta = { ip: "203.0.113.9", userAgent: "vitest", requestId: "req" }
let audits: { action: string; entityId: string; after?: unknown }[] = []
let revalidations = 0

function staffAs(roleKey: string): StaffContext {
  return fixtureStaff(roleKey)
}

const catalog = () =>
  staffService(createStaffCatalog({
    catalog: catalogRepository(),
    pricing: pricing(),
    inventory: inventory(),
    audit: async (_staff, _meta, entry) => void audits.push(entry),
    revalidate: () => void (revalidations += 1),
  }))

const input = (changes: Partial<ProductInput> = {}): ProductInput => ({
  title: "Test Runner",
  slug: `test-runner-${Math.random().toString(36).slice(2, 8)}`,
  brandId: db().brands[0].id,
  kind: "new",
  gender: "men",
  description: "A test pair.",
  condition: null,
  conditionNotes: null,
  tags: ["test"],
  collections: [],
  seo: {},
  images: [],
  variants: [{ sku: `TST-${Math.random().toString(36).slice(2, 8)}`, size: { eu: "42", uk: "8", us: "9", cm: "27" }, weightGrams: 900, price: null, compareAt: null }],
  ...changes,
})

async function pngBytes(width = 64, height = 48) {
  return new Uint8Array(await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 255, b: 0 } } }).png().toBuffer())
}

beforeEach(() => {
  resetFixtures()
  audits = []
  revalidations = 0
})

describe("staff products", () => {
  it("creates drafts, keeps prices to pricing:write, and saves nothing when a price change is refused", async () => {
    const editor = staffAs("catalogue_editor")
    const before = db().products.length
    await expect(catalog().saveProduct(editor, meta, input({ variants: [{ ...input().variants[0], price: 1_499_900 }] }), {})).rejects.toMatchObject({ code: "forbidden", details: { permission: "pricing:write" } })
    expect(db().products).toHaveLength(before)

    const draft = await catalog().saveProduct(editor, meta, input(), {})
    expect(draft.status).toBe("draft")
    const manager = staffAs("store_manager")
    const detail = await catalog().getProduct(manager, draft.id)
    const variant = detail.product.variants[0]
    await catalog().saveProduct(manager, meta, input({ slug: draft.slug, variants: [{ id: variant.id, sku: variant.sku, size: variant.size, weightGrams: 900, price: 1_499_900, compareAt: 1_999_900 }] }), { id: draft.id, expectedUpdatedAt: detail.updatedAt })
    expect((await catalog().getProduct(manager, draft.id)).prices[variant.id]).toEqual({ amount: 1_499_900, compareAt: 1_999_900 })
    expect(audits.map((entry) => entry.action)).toEqual(["product.created", "product.updated"])
    expect(revalidations).toBe(2)
  })

  it("refuses stale saves, taken slugs and SKUs, and publishing without photos and prices", async () => {
    const manager = staffAs("store_manager")
    const created = await catalog().saveProduct(manager, meta, input(), {})
    const first = await catalog().getProduct(manager, created.id)
    const edit = input({ slug: created.slug, variants: [{ ...input().variants[0], id: first.product.variants[0].id, sku: first.product.variants[0].sku }] })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await catalog().saveProduct(manager, meta, { ...edit, title: "First save" }, { id: created.id, expectedUpdatedAt: first.updatedAt })
    await expect(catalog().saveProduct(manager, meta, { ...edit, title: "Stale save" }, { id: created.id, expectedUpdatedAt: first.updatedAt })).rejects.toMatchObject({ code: "conflict" })

    const seeded = db().products[0]
    await expect(catalog().saveProduct(manager, meta, input({ slug: seeded.slug }), {})).rejects.toMatchObject({ code: "conflict" })
    await expect(catalog().saveProduct(manager, meta, input({ variants: [{ ...input().variants[0], sku: seeded.variants[0].sku }] }), {})).rejects.toMatchObject({ code: "conflict" })

    await expect(catalog().setStatus(manager, meta, created.id, "active")).rejects.toMatchObject({ message: "Add at least one photo before publishing." })
    const latest = await catalog().getProduct(manager, created.id)
    await catalog().saveProduct(manager, meta, { ...edit, images: [{ url: "/images/products/x.webp", alt: "Shoe", width: 800, height: 600, role: "card" }] }, { id: created.id, expectedUpdatedAt: latest.updatedAt })
    await expect(catalog().setStatus(manager, meta, created.id, "active")).rejects.toMatchObject({ message: "Every size needs a price before publishing." })
    const priced = await catalog().getProduct(manager, created.id)
    await catalog().saveProduct(manager, meta, { ...edit, images: priced.product.images.map((image) => ({ ...image, role: image.role ?? "gallery" })), variants: [{ ...edit.variants[0], price: 999_900 }] }, { id: created.id, expectedUpdatedAt: priced.updatedAt })
    await expect(catalog().setStatus(staffAs("catalogue_editor"), meta, created.id, "active")).resolves.toMatchObject({ status: "active" })
    await expect(catalog().setStatus(staffAs("content_editor"), meta, created.id, "draft")).rejects.toMatchObject({ code: "forbidden" })
    // Live products appear on the storefront.
    expect((await catalogRepository().getProductBySlug(STORE_ID, created.slug))?.id).toBe(created.id)
  })

  it("needs a grade for pre-loved pairs only and deletes only products that were never ordered", async () => {
    const owner = staffAs("owner")
    const { productInput } = await import("@/features/admin/products/schema")
    expect(productInput.safeParse(input({ kind: "preloved" })).success).toBe(false)
    expect(productInput.safeParse(input({ kind: "preloved", condition: "excellent" })).success).toBe(true)
    expect(productInput.safeParse({ ...input({ kind: "preloved" }), condition: "like-new" }).success).toBe(false)
    expect(productInput.safeParse(input({ condition: "excellent" })).success).toBe(false)

    const product = await catalog().saveProduct(owner, meta, input(), {})
    await catalog().deleteProduct(owner, meta, product.id, "Test entry")
    expect(db().products.some((row) => row.id === product.id)).toBe(false)
    expect(db().inventory.some((row) => row.variantId === product.variants[0].id)).toBe(false)
    await expect(catalog().deleteProduct(staffAs("catalogue_editor"), meta, db().products[0].id, "x")).rejects.toMatchObject({ code: "forbidden" })
  })
})

describe("staff collections and stock", () => {
  it("curates manual collections and keeps rule collections free of picks", async () => {
    const editor = staffAs("catalogue_editor")
    const [a, b] = db().products
    const saved = await catalog().saveCollection(editor, meta, { slug: "staff-picks", title: "Staff picks", headline: ["Staff", "picks"], description: "", kind: "manual", rules: [], seo: {}, productIds: [a.id, b.id] })
    expect((await catalog().collection(editor, saved.id)).productIds.sort()).toEqual([a.id, b.id].sort())
    await catalog().saveCollection(editor, meta, { id: saved.id, slug: "staff-favourites", title: "Staff favourites", headline: ["Staff", "favourites"], description: "", kind: "manual", rules: [], seo: {}, productIds: [b.id] })
    expect(db().products.find((row) => row.id === a.id)?.collections).not.toContain("staff-favourites")
    expect(db().products.find((row) => row.id === b.id)?.collections).toContain("staff-favourites")
    expect(db().products.some((row) => row.collections.includes("staff-picks"))).toBe(false)

    await expect(catalog().saveCollection(editor, meta, { slug: "rules", title: "Rules", headline: ["", ""], description: "", kind: "rule", rules: [], seo: {}, productIds: null })).rejects.toMatchObject({ code: "validation" })
    const rule = await catalog().saveCollection(editor, meta, { slug: "rules", title: "Rules", headline: ["", ""], description: "", kind: "rule", rules: [{ field: "kind", equals: "preloved" }], seo: {}, productIds: [a.id] })
    expect((await catalog().collection(editor, rule.id)).productIds).toEqual([])
    await catalog().deleteCollection(editor, meta, saved.id, null)
    expect(db().products.some((row) => row.collections.includes("staff-favourites"))).toBe(false)
    await expect(catalog().saveCollection(staffAs("support_agent"), meta, { slug: "x-y", title: "X", headline: ["", ""], description: "", kind: "manual", rules: [], seo: {}, productIds: [] })).rejects.toMatchObject({ code: "forbidden" })
  })

  it("reads complete stock with only inventory permission and bounds internal page requests", async () => {
    const staff = staffAs("fulfilment")
    db().adminRoles.find(role => role.id === staff.roles[0].id)!.permissions = ["inventory:read"]
    staff.permissions = ["inventory:read"]
    const page = await catalog().stock(staff, { page: 1, pageSize: 500 })
    expect(page.total).toBe(db().products.filter(product => ["active", "draft"].includes(product.status)).reduce((total, product) => total + product.variants.length, 0))
    expect(page.rows).toHaveLength(page.total)
    await expect(catalog().stock(staff, { page: 1, pageSize: 1001 })).rejects.toMatchObject({ code: "validation" })
    await expect(catalog().stock(staffAs("content_editor"), { page: 1, pageSize: 50 })).rejects.toMatchObject({ code: "forbidden" })
  })

  it("adjusts stock with a reason, records the ledger and never goes below what bags hold", async () => {
    const fulfilment = staffAs("fulfilment")
    const level = db().inventory.find((row) => row.onHand > 0)!
    level.reserved = 1
    await expect(catalog().adjustStock(fulfilment, meta, level.variantId, -level.onHand, "Count")).rejects.toMatchObject({ code: "validation" })
    const onHand = await catalog().adjustStock(fulfilment, meta, level.variantId, 3, "Received from supplier")
    expect(onHand).toBe(level.onHand)
    const movements = await catalog().movements(fulfilment, [level.variantId])
    expect(movements[0]).toMatchObject({ delta: 3, reason: "Received from supplier", actor: "staff:" + fulfilment.member.userId })
    await expect(catalog().adjustStock(staffAs("support_agent"), meta, level.variantId, 1, "x")).rejects.toMatchObject({ code: "forbidden" })
    const low = await catalog().stock(fulfilment, { low: 0, page: 1, pageSize: 500 })
    expect(low.rows.every((row) => row.available <= 0)).toBe(true)
  })
})

describe("media uploads", () => {
  it("accepts real images by their bytes and re-encodes them to WebP without metadata", async () => {
    const png = await pngBytes(3000, 1500)
    expect(sniffImage(png)).toBe("png")
    const result = await processImage(png)
    expect(sniffImage(result.data)).toBe("webp")
    expect([result.width, result.height]).toEqual([2400, 1200])
    const metadata = await sharp(result.data).metadata()
    expect(metadata.exif).toBeUndefined()
  })

  it("refuses files that only claim to be images", async () => {
    await expect(processImage(new TextEncoder().encode("<svg onload=alert(1)>"))).rejects.toMatchObject({ code: "validation" })
    await expect(processImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6]))).rejects.toMatchObject({ code: "validation" })
    await expect(processImage(new Uint8Array(0))).rejects.toMatchObject({ code: "validation" })
  })

  it("uploads, serves and protects images in use", async () => {
    let used: string[] = []
    const service = staffService(createMediaService({ media: bindActor<MediaOperations>(createFixturesMediaRepository(), currentActor), audit: async (_s, _m, entry) => void audits.push(entry), usage: async () => used }))
    const item = await service.upload(staffAs("content_editor"), meta, { name: "../../evil name.png", bytes: await pngBytes() }, "Lime square")
    expect(item).toMatchObject({ mime: "image/webp", width: 64, height: 48, alt: "Lime square", filename: ".._.._evil name.png" })
    expect(item.url).toBe(`/media/${item.id}.webp`)
    expect(sniffImage((await service.file(item.id))!.data)).toBe("webp")
    await expect(service.upload(staffAs("support_agent"), meta, { name: "x.png", bytes: await pngBytes() })).rejects.toMatchObject({ code: "forbidden" })
    used = ["some-product"]
    await expect(service.remove(staffAs("content_editor"), meta, item.id)).rejects.toMatchObject({ code: "conflict" })
    used = []
    await service.remove(staffAs("content_editor"), meta, item.id)
    expect(await service.file(item.id)).toBeNull()
    expect(audits.map((entry) => entry.action)).toEqual(["media.uploaded", "media.deleted"])
  })
})
