import "server-only"

import type { ProductInput } from "@/features/admin/products/schema"
import type { Permission } from "@/server/admin/permissions"
import type { RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import type { CatalogRepository } from "@/server/catalog/repository"
import { cardImage, type AdminProductQuery, type Collection, type CollectionRule, type Product, type ProductStatus } from "@/server/catalog/types"
import type { InventoryRepository } from "@/server/inventory/repository"
import type { PriceList, PriceRow } from "@/server/pricing/types"
import { DomainError } from "@/server/shared/errors"
import { newId, now } from "@/server/shared/ids"

/**
 * Staff catalogue operations (admin A3): products, prices, collections, stock and brands. Each
 * checks the member's permission, writes through the catalogue/pricing/inventory repositories (the
 * same RPCs as imports and the storefront), records an audit entry and refreshes the storefront.
 */

type Audit = (staff: StaffContext, meta: RequestMeta, entry: { action: string; entity: string; entityId: string; before?: unknown; after?: unknown; reason?: string | null; storeId: string }) => Promise<void>

type Pricing = { priceLists: (storeId: string) => Promise<PriceList[]>; rawPrices: (variantIds: string[]) => Promise<PriceRow[]>; upsertPrices: (rows: PriceRow[]) => Promise<number> }

type Deps = { catalog: CatalogRepository; pricing: Pricing; inventory: InventoryRepository; audit: Audit; revalidate: () => void }

const need = (staff: StaffContext, permission: Permission) => {
  if (!staff.permissions.includes(permission)) throw new DomainError("forbidden", "You don't have permission to do that.", { permission })
}

export type StaffProductRow = {
  id: string
  title: string
  brand: string
  slug: string
  kind: Product["kind"]
  status: ProductStatus
  image: string | null
  sizes: number
  stock: number
  price: number | null
  updatedAt: string
}

export type StaffProductDetail = {
  product: Product
  prices: Record<string, { amount: number; compareAt: number | null }>
  stock: Record<string, { onHand: number; reserved: number }>
  updatedAt: string
}

const versionOf = (product: Product) => product.updatedAt ?? product.publishedAt

/** Which fields changed, for the audit entry (descriptions and photos summarised, not copied). */
function diff(before: Product | null, after: Product): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const pick = (product: Product) => ({
    title: product.title,
    slug: product.slug,
    brand: product.brand.slug,
    kind: product.kind,
    gender: product.gender,
    status: product.status,
    condition: product.condition,
    tags: product.tags.join(","),
    collections: product.collections.join(","),
    photos: product.images.length,
    sizes: product.variants.map((variant) => `${variant.sku}:${variant.size.eu}`).join(","),
    description: product.description.length,
  })
  const next = pick(after)
  if (!before) return { before: {}, after: next }
  const previous = pick(before)
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((key) => previous[key] !== next[key])
  return { before: Object.fromEntries(changed.map((key) => [key, previous[key]])), after: Object.fromEntries(changed.map((key) => [key, next[key]])) }
}

export function createStaffCatalog(deps: Deps) {
  const { catalog, pricing, inventory } = deps

  async function baseList(storeId: string) {
    const base = (await pricing.priceLists(storeId)).filter((list) => list.customerGroup === null).sort((a, b) => a.priority - b.priority)[0]
    if (!base) throw new DomainError("unavailable", "The store has no base price list.")
    return base
  }

  async function load(staff: StaffContext, id: string) {
    const product = await catalog.getProductById(staff.member.storeId, id)
    if (!product) throw new DomainError("not_found", "Product not found.")
    return product
  }

  return {
    async listProducts(staff: StaffContext, query: AdminProductQuery): Promise<{ rows: StaffProductRow[]; total: number }> {
      need(staff, "products:read")
      const { products, total } = await catalog.searchProducts(staff.member.storeId, query)
      const variantIds = products.flatMap((product) => product.variants.map((variant) => variant.id))
      const [base, prices, levels] = await Promise.all([baseList(staff.member.storeId), pricing.rawPrices(variantIds), inventory.levels(variantIds)])
      return {
        total,
        rows: products.map((product) => {
          const ids = new Set(product.variants.map((variant) => variant.id))
          const amounts = prices.filter((row) => ids.has(row.variantId) && row.priceListId === base.id).map((row) => row.amount)
          return {
            id: product.id,
            title: product.title,
            brand: product.brand.name,
            slug: product.slug,
            kind: product.kind,
            status: product.status,
            image: cardImage(product.images)?.url ?? null,
            sizes: product.variants.length,
            stock: levels.filter((row) => ids.has(row.variantId)).reduce((sum, row) => sum + row.onHand, 0),
            price: amounts.length ? Math.min(...amounts) : null,
            updatedAt: versionOf(product),
          }
        }),
      }
    },

    async getProduct(staff: StaffContext, id: string): Promise<StaffProductDetail> {
      need(staff, "products:read")
      const product = await load(staff, id)
      const variantIds = product.variants.map((variant) => variant.id)
      const [base, prices, levels] = await Promise.all([baseList(staff.member.storeId), pricing.rawPrices(variantIds), inventory.levels(variantIds)])
      return {
        product,
        prices: Object.fromEntries(prices.filter((row) => row.priceListId === base.id).map((row) => [row.variantId, { amount: row.amount, compareAt: row.compareAt }])),
        stock: Object.fromEntries(levels.map((row) => [row.variantId, { onHand: row.onHand, reserved: row.reserved }])),
        updatedAt: versionOf(product),
      }
    },

    /** Creates (no id) or updates a product. New products start as drafts; publishing is its own permission. */
    async saveProduct(staff: StaffContext, meta: RequestMeta, input: ProductInput, options: { id?: string; expectedUpdatedAt?: string | null }) {
      need(staff, "products:write")
      const storeId = staff.member.storeId
      const before = options.id ? await load(staff, options.id) : null
      const brand = (await catalog.listBrands(storeId)).find((entry) => entry.id === input.brandId)
      if (!brand) throw new DomainError("validation", "Choose a brand.", { fields: { brandId: ["Choose a brand"] } })
      const collections = await catalog.listCollections(storeId)
      const manual = new Set(collections.filter((collection) => collection.kind === "manual").map((collection) => collection.slug))
      const unknown = input.collections.filter((slug) => !manual.has(slug))
      if (unknown.length) throw new DomainError("validation", "Unknown collection.", { unknown })

      const priced = input.variants.some((variant) => variant.price !== null || variant.compareAt !== null)
      const variants = input.variants.map((variant, position) => ({ id: variant.id ?? newId(), sku: variant.sku, size: variant.size, attributes: before?.variants.find((row) => row.id === variant.id)?.attributes ?? {}, weightGrams: variant.weightGrams, position }))
      if (before && input.variants.some((variant) => variant.id && !before.variants.some((row) => row.id === variant.id))) throw new DomainError("validation", "Unknown size.")

      const product: Product = {
        id: before?.id ?? newId(),
        storeId,
        slug: input.slug,
        title: input.title,
        brand,
        kind: input.kind,
        gender: input.gender,
        status: before?.status ?? "draft",
        description: input.description,
        condition: input.kind === "preloved" ? input.condition : null,
        conditionNotes: input.kind === "preloved" ? input.conditionNotes : null,
        images: input.images,
        variants,
        attributes: before?.attributes ?? {},
        customFields: before?.customFields ?? {},
        collections: [...input.collections, ...(before?.collections.filter((slug) => !manual.has(slug)) ?? [])],
        tags: input.tags,
        position: before?.position ?? 0,
        publishedAt: before?.publishedAt ?? now(),
        seo: input.seo,
      }

      // Prices are checked before anything is written, so a refused price change saves nothing.
      let priceRows: PriceRow[] = []
      if (priced) {
        const base = await baseList(storeId)
        const current = await pricing.rawPrices(variants.map((variant) => variant.id))
        priceRows = input.variants.flatMap((variant, index) => {
          const variantId = variants[index].id
          const existing = current.find((row) => row.variantId === variantId && row.priceListId === base.id)
          const amount = variant.price ?? existing?.amount
          if (amount === undefined) return []
          const next = { priceListId: base.id, variantId, amount, compareAt: variant.compareAt }
          return existing && existing.amount === next.amount && existing.compareAt === next.compareAt ? [] : [next]
        })
        if (priceRows.length) need(staff, "pricing:write")
      }

      const saved = await catalog.saveProduct(storeId, product, before ? (options.expectedUpdatedAt ?? null) : null)
      if (priceRows.length) await pricing.upsertPrices(priceRows)
      const changes = diff(before, saved)
      await deps.audit(staff, meta, { action: before ? "product.updated" : "product.created", entity: "product", entityId: saved.id, before: changes.before, after: { ...changes.after, ...(priceRows.length ? { prices: priceRows.map((row) => ({ variantId: row.variantId, amount: row.amount, compareAt: row.compareAt })) } : {}) }, storeId })
      deps.revalidate()
      return saved
    },

    /** Publish (active), unpublish (draft) or archive. */
    async setStatus(staff: StaffContext, meta: RequestMeta, id: string, status: ProductStatus, expectedUpdatedAt?: string) {
      need(staff, "products:publish")
      const before = await load(staff, id)
      if (before.status === status) return before
      if (status === "active" && before.variants.length === 0) throw new DomainError("validation", "Add at least one size before publishing.")
      if (status === "active" && before.images.length === 0) throw new DomainError("validation", "Add at least one photo before publishing.")
      if (status === "active") {
        const base = await baseList(staff.member.storeId)
        const priced = new Set((await pricing.rawPrices(before.variants.map((variant) => variant.id))).filter((row) => row.priceListId === base.id).map((row) => row.variantId))
        if (before.variants.some((variant) => !priced.has(variant.id))) throw new DomainError("validation", "Every size needs a price before publishing.")
      }
      const saved = await catalog.saveProduct(staff.member.storeId, { ...before, status, publishedAt: status === "active" && before.status === "draft" ? now() : before.publishedAt }, expectedUpdatedAt ?? null)
      await deps.audit(staff, meta, { action: status === "active" ? "product.published" : status === "archived" ? "product.archived" : "product.unpublished", entity: "product", entityId: id, before: { status: before.status }, after: { status }, storeId: staff.member.storeId })
      deps.revalidate()
      return saved
    },

    async deleteProduct(staff: StaffContext, meta: RequestMeta, id: string, reason: string | null) {
      need(staff, "products:delete")
      const before = await load(staff, id)
      await catalog.deleteProduct(staff.member.storeId, id)
      await deps.audit(staff, meta, { action: "product.deleted", entity: "product", entityId: id, before: { title: before.title, slug: before.slug, sizes: before.variants.length }, reason, storeId: staff.member.storeId })
      deps.revalidate()
    },

    async brands(staff: StaffContext) {
      need(staff, "products:read")
      return catalog.listBrands(staff.member.storeId)
    },

    async createBrand(staff: StaffContext, meta: RequestMeta, name: string) {
      need(staff, "products:write")
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
      if (!slug) throw new DomainError("validation", "Give the brand a name.")
      const brands = await catalog.listBrands(staff.member.storeId)
      const brand = await catalog.createBrand(staff.member.storeId, { id: newId(), slug, name: name.trim(), position: brands.length })
      await deps.audit(staff, meta, { action: "brand.created", entity: "brand", entityId: brand.id, after: { name: brand.name, slug }, storeId: staff.member.storeId })
      return brand
    },

    // ─── Collections ─────────────────────────────────────────────────────────
    async collections(staff: StaffContext) {
      need(staff, "collections:read")
      const storeId = staff.member.storeId
      const list = await catalog.listCollections(storeId)
      return Promise.all(list.map(async (collection) => ({ ...collection, products: collection.kind === "manual" ? (await catalog.collectionProductIds(storeId, collection.id)).length : null })))
    },

    async collection(staff: StaffContext, id: string) {
      need(staff, "collections:read")
      const collection = (await catalog.listCollections(staff.member.storeId)).find((entry) => entry.id === id)
      if (!collection) throw new DomainError("not_found", "Collection not found.")
      const productIds = await catalog.collectionProductIds(staff.member.storeId, id)
      const products = (await Promise.all(productIds.map((productId) => catalog.getProductById(staff.member.storeId, productId)))).flatMap((product) => (product ? [{ id: product.id, title: `${product.brand.name} ${product.title}` }] : []))
      return { collection, productIds, products }
    },

    async saveCollection(
      staff: StaffContext,
      meta: RequestMeta,
      input: { id?: string; slug: string; title: string; headline: [string, string]; description: string; kind: "manual" | "rule"; rules: CollectionRule[]; seo: Collection["seo"]; productIds: string[] | null },
    ) {
      need(staff, "collections:write")
      const storeId = staff.member.storeId
      const existing = await catalog.listCollections(storeId)
      const before = input.id ? existing.find((entry) => entry.id === input.id) : undefined
      if (input.id && !before) throw new DomainError("not_found", "Collection not found.")
      if (input.kind === "rule" && input.rules.length === 0) throw new DomainError("validation", "A rule-based collection needs at least one rule.")
      const collection: Collection = {
        id: before?.id ?? newId(),
        storeId,
        slug: input.slug,
        title: input.title,
        headline: input.headline,
        description: input.description,
        kind: input.kind,
        rules: input.kind === "rule" ? input.rules : [],
        image: before?.image ?? null,
        position: before?.position ?? existing.length,
        seo: input.seo,
      }
      const saved = await catalog.saveCollection(storeId, collection, input.kind === "manual" ? input.productIds : null)
      await deps.audit(staff, meta, {
        action: before ? "collection.updated" : "collection.created",
        entity: "collection",
        entityId: saved.id,
        before: before ? { title: before.title, slug: before.slug, kind: before.kind, rules: before.rules } : undefined,
        after: { title: saved.title, slug: saved.slug, kind: saved.kind, rules: saved.rules, products: input.productIds?.length ?? null },
        storeId,
      })
      deps.revalidate()
      return saved
    },

    async deleteCollection(staff: StaffContext, meta: RequestMeta, id: string, reason: string | null) {
      need(staff, "collections:write")
      const before = (await catalog.listCollections(staff.member.storeId)).find((entry) => entry.id === id)
      if (!before) throw new DomainError("not_found", "Collection not found.")
      await catalog.deleteCollection(staff.member.storeId, id)
      await deps.audit(staff, meta, { action: "collection.deleted", entity: "collection", entityId: id, before: { title: before.title, slug: before.slug }, reason, storeId: staff.member.storeId })
      deps.revalidate()
    },

    // ─── Inventory ───────────────────────────────────────────────────────────
    /** One row per size: on hand, held in carts, available; `low` keeps sizes at or below the threshold. */
    async stock(staff: StaffContext, query: { q?: string; low?: number; page: number; pageSize: number }) {
      need(staff, "inventory:read")
      const { products } = await catalog.searchProducts(staff.member.storeId, { q: query.q, status: ["active", "draft"], page: 1, pageSize: 10_000 })
      const variants = products.flatMap((product) => product.variants.map((variant) => ({ product, variant })))
      const levels = new Map((await inventory.levels(variants.map((entry) => entry.variant.id))).map((row) => [row.variantId, row]))
      const rows = variants
        .map(({ product, variant }) => {
          const level = levels.get(variant.id) ?? { onHand: 0, reserved: 0 }
          return { variantId: variant.id, productId: product.id, title: `${product.brand.name} ${product.title}`, status: product.status, sku: variant.sku, size: variant.size, onHand: level.onHand, reserved: level.reserved, available: level.onHand - level.reserved }
        })
        .filter((row) => query.low === undefined || row.available <= query.low)
        .sort((a, b) => a.available - b.available || a.title.localeCompare(b.title))
      const start = (query.page - 1) * query.pageSize
      return { rows: rows.slice(start, start + query.pageSize), total: rows.length }
    },

    async movements(staff: StaffContext, variantIds: string[], limit = 50) {
      need(staff, "inventory:read")
      return inventory.movements(variantIds, limit)
    },

    /** Sets stock by a difference with a reason (the ledger records who and why); never below what carts hold. */
    async adjustStock(staff: StaffContext, meta: RequestMeta, variantId: string, delta: number, reason: string) {
      need(staff, "inventory:adjust")
      if (!Number.isInteger(delta) || delta === 0) throw new DomainError("validation", "Enter how many pairs to add or remove.")
      const [level] = await inventory.levels([variantId])
      if (!level) throw new DomainError("not_found", "Unknown size.")
      if (level.onHand + delta < level.reserved) throw new DomainError("validation", `${level.reserved} of these are held in shoppers' bags, so stock can't go below that.`)
      const onHand = await inventory.adjust(variantId, delta, reason.trim(), `staff:${staff.member.userId}`)
      await deps.audit(staff, meta, { action: "inventory.adjusted", entity: "variant", entityId: variantId, before: { onHand: level.onHand }, after: { onHand }, reason, storeId: staff.member.storeId })
      deps.revalidate()
      return onHand
    },
  }
}

export type StaffCatalog = ReturnType<typeof createStaffCatalog>
