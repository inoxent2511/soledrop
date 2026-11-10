import "server-only"
import { and, eq, exists, inArray, like, or } from "drizzle-orm"
import type { Database } from "@/server/db/client"
import { brands, products, variants } from "@/server/db/schema"
import { escapeLike } from "@/server/db/values"
import type { AdminProductQuery } from "./types"

/** Shared product matching: an SKU match includes every size of that product. */
export function staffProductScope(db: Database, storeId: string, query: Pick<AdminProductQuery, "q" | "status" | "kind" | "brandId">) {
  const term = query.q?.trim() ? "%" + escapeLike(query.q.trim()) + "%" : null
  return and(eq(products.storeId, storeId), query.status?.length ? inArray(products.status, query.status) : undefined, query.kind ? eq(products.kind, query.kind) : undefined, query.brandId ? eq(products.brandId, query.brandId) : undefined,
    term ? or(like(products.title, term), like(products.slug, term), exists(db.select({ id: variants.id }).from(variants).where(and(eq(variants.productId, products.id), like(variants.sku, term)))), exists(db.select({ id: brands.id }).from(brands).where(and(eq(brands.id, products.brandId), eq(brands.storeId, storeId), like(brands.name, term))))) : undefined)
}
