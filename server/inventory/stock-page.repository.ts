import "server-only"
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, lte, gte, or, sql } from "drizzle-orm"
import type { Actor } from "@/server/db/actor"
import { requireGrant, requireStore } from "@/server/db/actor"
import { withTransaction } from "@/server/db/client"
import { brands, inventoryLevels, products, variants } from "@/server/db/schema"
import { staffProductScope } from "@/server/catalog/staff-search.repository"
import { BoundedSelection } from "@/server/shared/bounded-selection"
import type { StockPageQuery, StockPageRow } from "./repository"
import { validateStockPage } from "./stock-page"

type Candidate = { variantId: string; productId: string; title: string; available: number; version: string; position: number }
const BATCH = 5000
const available = sql.fromList([inventoryLevels.available]).mapWith(Number)
const zero = sql.fromList([sql.raw("0")]).mapWith(Number)
const title = sql.fromList([sql.raw("CONCAT("), brands.name, sql.raw(", ' ', "), products.title, sql.raw(")")]).mapWith(String)
const compare = (a: Candidate, b: Candidate) => a.available - b.available || a.title.localeCompare(b.title) || b.version.localeCompare(a.version) || a.productId.localeCompare(b.productId) || a.position - b.position || a.variantId.localeCompare(b.variantId)

/** Exact JS title ordering over narrow indexed batches, without a 10,000-product cutoff. */
export async function stockPage(actor: Actor, storeId: string, query: StockPageQuery): Promise<{ rows: StockPageRow[]; total: number }> {
  requireStore(actor, storeId); requireGrant(actor, "inventory:read"); validateStockPage(query)
  return withTransaction(async db => {
    const productScope = staffProductScope(db, actor.storeId, { q: query.q, status: ["active", "draft"] })
    const scope = and(productScope, eq(brands.storeId, actor.storeId))
    const value = sql.fromList([sql.raw("COALESCE("), available, sql.raw(",0)")]).mapWith(Number)
    const [counts] = await db.select({ total: count(), missing: sql.fromList([sql.raw("COALESCE(SUM(CASE WHEN "), inventoryLevels.variantId, sql.raw(" IS NULL THEN 1 ELSE 0 END),0)")]).mapWith(Number) }).from(variants).innerJoin(products, eq(products.id, variants.productId)).leftJoin(inventoryLevels, eq(inventoryLevels.variantId, variants.id)).where(and(productScope, query.low === undefined ? undefined : lte(value, query.low)))
    const total = counts.total, start = (query.page - 1) * query.pageSize
    if (start >= total) return { rows: [], total }
    const end = Math.min(total, start + query.pageSize), reverse = total - start < end
    const selected = new BoundedSelection<Candidate>(reverse ? total - start : end, reverse ? (a, b) => compare(b, a) : compare)
    const fields = { variantId: variants.id, productId: products.id, title, version: products.updatedAt, position: variants.position }
    // This DATETIME(3) column has a fixed UTC representation, which retains its SQL ordering.
    const add = (row: Candidate) => selected.add(row)

    // Missing legacy level rows mean zero stock. Normally this branch is empty; it never
    // requires a product graph and preserves that existing fallback when it is needed.
    if (counts.missing) {
      let cursor: string | undefined
      for (;;) {
        const rows = await db.select({ ...fields, available: zero }).from(variants).innerJoin(products, eq(products.id, variants.productId)).innerJoin(brands, eq(brands.id, products.brandId)).leftJoin(inventoryLevels, eq(inventoryLevels.variantId, variants.id)).where(and(scope, isNull(inventoryLevels.variantId), cursor ? reverse ? lt(variants.id, cursor) : gt(variants.id, cursor) : undefined)).orderBy(reverse ? desc(variants.id) : asc(variants.id)).limit(BATCH)
        rows.forEach(add)
        if (rows.length < BATCH) break
        cursor = rows[rows.length - 1].variantId
      }
    }

    // Broad reads must retain the indexed level-first join order: forcing only the
    // index can make MariaDB scan it once per variant. STRAIGHT_JOIN is a SELECT
    // modifier and therefore deliberately leads the first selected expression.
    // Selective reads remain free to start from their small product scope.
    const broadVariantId = total > BATCH ? sql.fromList([sql.raw("STRAIGHT_JOIN "), variants.id]).mapWith(variants.id) : variants.id
    let cursor: { available: number; id: string } | undefined
    for (;;) {
      const cutoff = selected.size === selected.limit ? selected.largest?.available : undefined
      const after = cursor ? or(reverse ? lt(available, cursor.available) : gt(available, cursor.available), and(eq(available, cursor.available), reverse ? lt(inventoryLevels.variantId, cursor.id) : gt(inventoryLevels.variantId, cursor.id))) : undefined
      const rows = await db.select({ variantId: broadVariantId, productId: products.id, title, version: products.updatedAt, position: variants.position, available }).from(inventoryLevels, total > BATCH ? { forceIndex: "inventory_available_lookup" } : undefined).innerJoin(variants, eq(variants.id, inventoryLevels.variantId)).innerJoin(products, eq(products.id, variants.productId)).innerJoin(brands, eq(brands.id, products.brandId)).where(and(scope, after, query.low === undefined ? undefined : lte(available, query.low), cutoff === undefined ? undefined : reverse ? gte(available, cutoff) : lte(available, cutoff))).orderBy(reverse ? desc(available) : asc(available), reverse ? desc(inventoryLevels.variantId) : asc(inventoryLevels.variantId)).limit(BATCH)
      let finished = false
      for (const row of rows) {
        const boundary = selected.size === selected.limit ? selected.largest?.available : undefined
        if (boundary !== undefined && (reverse ? row.available < boundary : row.available > boundary)) { finished = true; break }
        add(row)
      }
      if (finished || rows.length < BATCH) break
      const last = rows[rows.length - 1]
      cursor = { available: last.available, id: last.variantId }
    }
    const ordered = selected.sorted(), page = reverse ? ordered.reverse().slice(0, end - start) : ordered.slice(start, end)
    const details = await db.select({ variantId: variants.id, productId: products.id, title, status: products.status, sku: variants.sku, size: { eu: variants.sizeEu, uk: variants.sizeUk, us: variants.sizeUs, cm: variants.sizeCm }, onHand: sql.fromList([sql.raw("COALESCE("), inventoryLevels.onHand, sql.raw(",0)")]).mapWith(Number), reserved: sql.fromList([sql.raw("COALESCE("), inventoryLevels.reserved, sql.raw(",0)")]).mapWith(Number), available: value }).from(variants).innerJoin(products, eq(products.id, variants.productId)).innerJoin(brands, eq(brands.id, products.brandId)).leftJoin(inventoryLevels, eq(inventoryLevels.variantId, variants.id)).where(and(scope, inArray(variants.id, page.map(row => row.variantId))))
    const byId = new Map(details.map(row => [row.variantId, row]))
    return { total, rows: page.map(row => byId.get(row.variantId)!).map(row => ({ ...row, status: row.status as StockPageRow["status"] })) }
  })
}
