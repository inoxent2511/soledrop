import "server-only"
import { and, asc, eq, inArray } from "drizzle-orm"
import type { Actor } from "@/server/db/actor"
import { requireGrant, requireStore } from "@/server/db/actor"
import type { Database } from "@/server/db/client"
import { priceLists, prices, productListingSizes, productListPrices, products, variants } from "@/server/db/schema"
import { headlinePrice } from "./service"
import type { CurrencyCode } from "@/server/shared/money"
import { bumpCatalogueRevision } from "./facet-cache.repository"

/** Rebuild only affected products inside their store-first mutation transaction. */
export async function syncCatalogueListing(db: Database, actor: Actor, productIds: string[], options = { sizes: true }) {
  if (actor.kind !== "system" || actor.purpose !== "migration") requireGrant(actor, actor.permissions.includes("products:write") ? "products:write" : "pricing:write")
  const ids = [...new Set(productIds)].sort()
  if (!ids.length) return
  await bumpCatalogueRevision(db, actor)
  const parents = await db.select({ id: products.id, storeId: products.storeId }).from(products).where(and(eq(products.storeId, actor.storeId), inArray(products.id, ids))).orderBy(products.id).for("update")
  for (const parent of parents) {
    requireStore(actor, parent.storeId)
    const sizes = await db.select({ id: variants.id, size: variants.sizeEu }).from(variants).where(eq(variants.productId, parent.id)).orderBy(asc(variants.position), variants.id).for("update")
    const rows = sizes.length ? await db.select({ variantId: prices.variantId, priceListId: prices.priceListId, amount: prices.amount, compareAt: prices.compareAt, currency: priceLists.currency }).from(prices).innerJoin(priceLists, and(eq(priceLists.id, prices.priceListId), eq(priceLists.storeId, actor.storeId))).where(inArray(prices.variantId, sizes.map((row) => row.id))).orderBy(prices.priceListId, prices.variantId).for("update") : []
    if (options.sizes) {
      await db.delete(productListingSizes).where(and(eq(productListingSizes.productId, parent.id), eq(productListingSizes.storeId, actor.storeId)))
      const values = [...new Set(sizes.map((row) => row.size))]
      if (values.length) await db.insert(productListingSizes).values(values.map((size) => ({ productId: parent.id, storeId: actor.storeId, size })))
    }
    await db.delete(productListPrices).where(and(eq(productListPrices.productId, parent.id), eq(productListPrices.storeId, actor.storeId)))
    for (const priceListId of [...new Set(rows.map((row) => row.priceListId))]) {
      const ordered = sizes.flatMap((variant) => {
        const row = rows.find((price) => price.variantId === variant.id && price.priceListId === priceListId)
        return row ? [{ ...row, currency: row.currency as CurrencyCode }] : []
      })
      const head = headlinePrice(ordered)
      await db.insert(productListPrices).values({ productId: parent.id, storeId: actor.storeId, priceListId, amount: head.amount, compareAt: head.compareAt })
    }
  }
}
