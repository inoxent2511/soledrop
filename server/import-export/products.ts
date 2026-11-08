import "server-only"

import { z } from "zod"

import type { CatalogService } from "@/server/catalog/service"
import { CONDITION_GRADES, type Product, type Variant } from "@/server/catalog/types"
import { parseCsv, toCsv } from "@/server/import-export/csv"
import type { InventoryOperations } from "@/server/inventory/repository"
import type { PricingService } from "@/server/pricing/service"
import { DomainError } from "@/server/shared/errors"
import { newId, now } from "@/server/shared/ids"

/** One row per variant; product columns repeat. Prices are whole rupees, stock is units on hand. */
export const PRODUCT_COLUMNS = [
  "slug",
  "title",
  "brand",
  "kind",
  "gender",
  "status",
  "condition",
  "description",
  "collections",
  "tags",
  "image_urls",
  "sku",
  "size_eu",
  "size_uk",
  "size_us",
  "size_cm",
  "price",
  "compare_at",
  "stock",
] as const

const rowSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be lower-case words joined by dashes"),
  title: z.string().min(2).max(120),
  brand: z.string().min(1),
  kind: z.enum(["new", "preloved"]),
  gender: z.enum(["men", "women", "kids", "unisex"]),
  status: z.enum(["active", "draft", "archived"]).default("active"),
  condition: z.union([z.enum(CONDITION_GRADES), z.literal("")]).optional(),
  description: z.string().max(5000).default(""),
  collections: z.string().default(""),
  tags: z.string().default(""),
  image_urls: z.string().default(""),
  sku: z.string().min(3).max(64),
  size_eu: z.string().regex(/^\d{2}(\.5)?$/),
  size_uk: z.string().default(""),
  size_us: z.string().default(""),
  size_cm: z.string().default(""),
  price: z.coerce.number().nonnegative(),
  compare_at: z.union([z.coerce.number().positive(), z.literal("")]).optional(),
  stock: z.coerce.number().int().nonnegative(),
})

export type ImportReport = { products: number; variants: number; errors: { row: number; message: string }[]; dryRun: boolean }

const split = (value: string, separator = "|") => value.split(separator).map((item) => item.trim()).filter(Boolean)

type Deps = { catalog: CatalogService; pricing: PricingService; inventory: InventoryOperations }

export function createProductTransfer({ catalog, pricing, inventory }: Deps) {
  async function baseList(storeId: string) {
    const lists = await pricing.priceLists(storeId)
    const base = lists.filter((list) => list.customerGroup === null).sort((a, b) => a.priority - b.priority)[0]
    if (!base) throw new DomainError("unavailable", "The store has no base price list.")
    return base
  }

  return {
    async exportCsv(storeId: string): Promise<string> {
      const products = await catalog.allProducts(storeId)
      const variantIds = products.flatMap((product) => product.variants.map((variant) => variant.id))
      const [base, prices, stock] = await Promise.all([baseList(storeId), pricing.rawPrices(variantIds), inventory.onHand(variantIds)])
      const rows = products.flatMap((product) =>
        product.variants.map((variant) => {
          const price = prices.find((row) => row.variantId === variant.id && row.priceListId === base.id)
          return {
            slug: product.slug,
            title: product.title,
            brand: product.brand.slug,
            kind: product.kind,
            gender: product.gender,
            status: product.status,
            condition: product.condition ?? "",
            description: product.description,
            collections: product.collections.join("|"),
            tags: product.tags.join("|"),
            image_urls: product.images.map((image) => image.url).join("|"),
            sku: variant.sku,
            size_eu: variant.size.eu,
            size_uk: variant.size.uk,
            size_us: variant.size.us,
            size_cm: variant.size.cm,
            price: price ? price.amount / 100 : "",
            compare_at: price?.compareAt ? price.compareAt / 100 : "",
            stock: stock.get(variant.id) ?? 0,
          }
        }),
      )
      return toCsv(PRODUCT_COLUMNS, rows)
    },

    /**
     * Upserts products by slug and variants by SKU, sets base prices and absolute stock.
     * Validates every row first; nothing is written if any row is invalid.
     */
    async importCsv(storeId: string, csv: string, options: { dryRun: boolean; actor: string }): Promise<ImportReport> {
      const raw = parseCsv(csv)
      const errors: ImportReport["errors"] = []
      const [brands, existing] = await Promise.all([catalog.brands(storeId), catalog.allProducts(storeId)])
      const parsed = raw.flatMap((row, index) => {
        const result = rowSchema.safeParse(row)
        if (!result.success) {
          errors.push({ row: index + 2, message: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") })
          return []
        }
        const brand = brands.find((item) => item.slug === result.data.brand)
        if (!brand) {
          errors.push({ row: index + 2, message: `brand: unknown brand "${result.data.brand}"` })
          return []
        }
        if (result.data.kind === "preloved" && !result.data.condition) errors.push({ row: index + 2, message: "condition: required for pre-loved products" })
        return [{ ...result.data, brand, line: index + 2 }]
      })
      if (raw.length === 0) errors.push({ row: 1, message: "The file has no rows." })

      const bySlug = new Map<string, typeof parsed>()
      for (const row of parsed) bySlug.set(row.slug, [...(bySlug.get(row.slug) ?? []), row])
      const skus = new Set<string>()
      for (const row of parsed) {
        if (skus.has(row.sku)) errors.push({ row: row.line, message: `sku: "${row.sku}" appears twice` })
        skus.add(row.sku)
      }
      if (errors.length || options.dryRun) return { products: bySlug.size, variants: parsed.length, errors, dryRun: options.dryRun || errors.length > 0 }

      const products: Product[] = []
      const priceRows: { variantId: string; amount: number; compareAt: number | null }[] = []
      const stockTargets: { variantId: string; quantity: number }[] = []
      for (const [slug, rows] of bySlug) {
        const current = existing.find((product) => product.slug === slug)
        const head = rows[0]
        const variants: Variant[] = rows.map((row, position) => {
          const previous = current?.variants.find((variant) => variant.sku === row.sku)
          const id = previous?.id ?? newId()
          priceRows.push({ variantId: id, amount: Math.round(row.price * 100), compareAt: row.compare_at ? Math.round(row.compare_at * 100) : null })
          stockTargets.push({ variantId: id, quantity: row.stock })
          return {
            id,
            sku: row.sku,
            size: { eu: row.size_eu, uk: row.size_uk, us: row.size_us, cm: row.size_cm },
            attributes: previous?.attributes ?? {},
            weightGrams: previous?.weightGrams ?? 900,
            position,
          }
        })
        const imageUrls = split(head.image_urls)
        products.push({
          id: current?.id ?? newId(),
          storeId,
          slug,
          title: head.title,
          brand: head.brand,
          kind: head.kind,
          gender: head.gender,
          status: head.status,
          description: head.description,
          condition: head.condition || null,
          conditionNotes: current?.conditionNotes ?? null,
          images: imageUrls.length
            ? imageUrls.map((url) => current?.images.find((image) => image.url === url) ?? { url, alt: head.title, width: 1200, height: 1200 })
            : (current?.images ?? []),
          variants,
          attributes: current?.attributes ?? {},
          customFields: current?.customFields ?? {},
          collections: split(head.collections),
          tags: split(head.tags),
          position: current?.position ?? existing.length + products.length,
          publishedAt: current?.publishedAt ?? now(),
          seo: current?.seo ?? {},
        })
      }

      await catalog.upsertProducts(storeId, products)
      const base = await baseList(storeId)
      await pricing.upsertPrices(priceRows.map((row) => ({ ...row, priceListId: base.id })))
      const onHand = await inventory.onHand(stockTargets.map((item) => item.variantId))
      for (const target of stockTargets) {
        const delta = target.quantity - (onHand.get(target.variantId) ?? 0)
        if (delta !== 0) await inventory.adjust(target.variantId, delta, "import", options.actor)
      }
      return { products: products.length, variants: parsed.length, errors: [], dryRun: false }
    },
  }
}
