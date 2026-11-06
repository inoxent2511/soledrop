import { randomUUID } from "node:crypto"
import path from "node:path"

import type { Collection, Product } from "@/server/catalog/types"
import type { StaffProductDetail } from "@/server/catalog/staff"
import type { HomeContent } from "@/server/content/home-types"
import type { FixtureTables } from "@/server/fixtures/tables"
import type { MediaView } from "@/server/media/service"
import { processImage } from "@/server/media/service"
import type { StaffOrderDetail } from "@/server/orders/staff"
import { writeLocalMedia } from "@/server/db/local-media"

export type CatalogueBackup = { data: Record<string, { status: number; body: unknown }> }

/** Recover exported settings and audited stock movements without adjusting the imported balances. */
export function restorePreviewMetadata(tables: FixtureTables, restoreFlags = true) {
  let movements = 0
  for (const entry of [...tables.audit].sort((a, b) => a.at.localeCompare(b.at))) {
    if (!entry.after || typeof entry.after !== "object") continue
    const after = entry.after as { enabled?: unknown; customerGroups?: unknown; onHand?: unknown; reason?: unknown }
    if (restoreFlags && entry.action === "flag.changed") {
      const flag = tables.flags.find((row) => row.key === entry.entityId)
      if (flag && typeof after.enabled === "boolean") {
        flag.enabled = after.enabled
        if (after.customerGroups === null) delete flag.customerGroups
        else if (Array.isArray(after.customerGroups) && after.customerGroups.every((group) => typeof group === "string")) flag.customerGroups = after.customerGroups
      }
    }
    if (entry.action !== "inventory.adjust" || entry.entity !== "variant" || tables.inventoryMovements.some((row) => row.id === entry.id)) continue
    const before = entry.before as { onHand?: unknown } | null
    if (typeof before?.onHand !== "number" || typeof after.onHand !== "number" || !Number.isSafeInteger(after.onHand - before.onHand) || !tables.inventory.some((row) => row.variantId === entry.entityId)) continue
    tables.inventoryMovements.push({ id: entry.id, variantId: entry.entityId, delta: after.onHand - before.onHand, reason: `Recovered preview audit: ${typeof after.reason === "string" ? after.reason : "stock adjustment"}`, actor: entry.actor, at: entry.at })
    movements++
  }
  return { movements }
}

/** One-time import from the live preview export. IDs, prices, stock and order history are retained. */
export async function migrateCatalogue(tables: FixtureTables, backup: CatalogueBackup, home: HomeContent, directory: string, readAsset: (url: string) => Uint8Array) {
  if (tables.products.length || tables.media.length || tables.orders.length) throw new Error("Destination must be empty; migration never overwrites a saved catalogue.")
  function get<T>(url: string): T {
    const result = backup.data[url]
    if (!result || result.status !== 200) throw new Error(`Missing successful backup: ${url}`)
    return structuredClone(result.body) as T
  }
  const listing = get<{ total: number; rows: { id: string }[] }>("/api/admin/products?size=100")
  if (listing.total !== listing.rows.length) throw new Error("Incomplete product backup.")
  const details = listing.rows.map((row) => get<StaffProductDetail>(`/api/admin/products/${row.id}`))
  const media = get<{ total: number; items: MediaView[] }>("/api/admin/media?size=100")
  if (media.total !== media.items.length) throw new Error("Incomplete media backup.")
  const storeId = tables.stores[0].id
  if (details.some((detail) => detail.product.storeId !== storeId) || media.items.some((item) => item.storeId !== storeId)) throw new Error("Backup belongs to a different store.")
  const mapping = new Map<string, { url: string; width: number; height: number }>()
  for (const { url, ...item } of media.items) {
    const bytes = readAsset(url)
    if (bytes.length !== item.bytes) throw new Error(`Incomplete media file: ${item.id}`)
    writeLocalMedia(directory, item.path, bytes)
    tables.media.push(item)
    mapping.set(url, { url, width: item.width, height: item.height })
  }
  async function upload(url: string, alt: string) {
    const existing = mapping.get(url)
    if (existing) return existing
    const image = await processImage(readAsset(url))
    const id = randomUUID()
    const item = { id, storeId, path: `${storeId}/${id}.webp`, filename: path.basename(url), mime: "image/webp" as const, bytes: image.data.length, width: image.width, height: image.height, alt, createdBy: null, createdAt: new Date().toISOString() }
    writeLocalMedia(directory, item.path, image.data)
    tables.media.push(item)
    const result = { url: `/media/${id}.webp`, width: image.width, height: image.height }
    mapping.set(url, result)
    return result
  }
  for (const detail of details) {
    for (const image of detail.product.images) Object.assign(image, await upload(image.url, image.alt))
    tables.products.push(detail.product)
    for (const variant of detail.product.variants) {
      const level = detail.stock[variant.id]
      // Browser cart holds expire with the old preview. Preserve sellable on-hand stock, release holds.
      tables.inventory.push({ variantId: variant.id, onHand: level?.onHand ?? 0, reserved: 0 })
      const price = detail.prices[variant.id]
      if (price) tables.prices.push({ variantId: variant.id, priceListId: tables.priceLists[0].id, ...price })
    }
  }
  tables.brands = get<{ brands: FixtureTables["brands"] }>("/api/admin/brands").brands
  const collections = get<{ collections: Collection[] }>("/api/admin/collections").collections
  for (const row of collections) {
    const { collection } = get<{ collection: Collection }>(`/api/admin/collections/${row.id}`)
    if (collection.storeId !== storeId) throw new Error("Collection belongs to a different store.")
    if (collection.image) Object.assign(collection.image, await upload(collection.image.url, collection.image.alt))
    tables.collections.push(collection)
  }
  for (const image of [...home.slides, ...home.instagram.images, ...home.categories.map((category) => category.image)]) image.src = (await upload(image.src, image.alt)).url
  tables.home = { content: home, updatedAt: new Date().toISOString() }
  const shipping = get<{ zones: FixtureTables["shippingZones"]; taxRates: FixtureTables["taxRates"] }>("/api/admin/shipping")
  tables.shippingZones = shipping.zones; tables.taxRates = shipping.taxRates
  tables.pages = get<{ pages: FixtureTables["pages"] }>("/api/admin/content/pages").pages
  tables.faqs = get<{ faqs: FixtureTables["faqs"] }>("/api/admin/content/faqs").faqs
  tables.promotions = get<{ promotions: FixtureTables["promotions"] }>("/api/admin/promotions").promotions
  tables.searchSynonyms = get<{ synonyms: FixtureTables["searchSynonyms"] }>("/api/admin/search/synonyms").synonyms
  const orders = get<{ total: number; orders: { number: string }[] }>("/api/admin/orders?size=100")
  if (orders.total !== orders.orders.length) throw new Error("Incomplete order backup.")
  for (const row of orders.orders) {
    const detail = get<StaffOrderDetail>(`/api/admin/orders/${row.number}`)
    if (detail.order.storeId !== storeId) throw new Error("Order belongs to a different store.")
    if (detail.piiMasked) throw new Error("Order backup is masked; export with PII permission before importing.")
    for (const line of detail.order.lines) if (line.imageUrl) line.imageUrl = (await upload(line.imageUrl, line.title)).url
    tables.orders.push(detail.order); tables.payments.push(...detail.payments); tables.refunds.push(...detail.refunds); tables.returns.push(...detail.returns)
    for (const note of detail.notes) tables.orderNotes.push({ ...note, orderId: detail.order.id, author: "migrated-staff" })
  }
  tables.orderSequence.next = Math.max(10001, ...tables.orders.map((order) => Number(order.number.replace(/^SD/, "")) + 1))
  const subscribers = get<{ rows: FixtureTables["newsletter"]; total: number }>("/api/admin/marketing/subscribers")
  if (subscribers.total !== subscribers.rows.length) throw new Error("Incomplete subscriber backup.")
  tables.newsletter = subscribers.rows
  // Deleted/archived seed products never reappear: only the live exported list is imported.
  const ids = new Set(tables.products.map((product: Product) => product.id))
  if (ids.size !== listing.total) throw new Error("Duplicate product IDs in backup.")
  return { products: tables.products.length, media: tables.media.length, collections: tables.collections.length, orders: tables.orders.length }
}
