import "server-only"
import { and, asc, count, eq, notInArray, sql } from "drizzle-orm"
import { mysqlPolicy } from "@/server/db/policy.repository"
import { type ActorScoped, requireStore } from "@/server/db/actor"
import { database } from "@/server/db/client"
import { collections, pages, productImages, products } from "@/server/db/schema"
import { isoDate } from "@/server/db/values"
import { DomainError } from "@/server/shared/errors"

export const SITEMAP_PAGE_SIZE = 5000
export type SitemapKind = "products" | "collections" | "pages"
export type SitemapRow = { slug: string; modified: string | null; image: string | null }
export type SitemapCounts = Record<SitemapKind, number>
type SitemapOperations = {
  counts(storeId: string): Promise<SitemapCounts>
  page(storeId: string, kind: SitemapKind, index: number): Promise<SitemapRow[]>
}
const dedicated = ["pre-loved", "sale"]
const indexablePage = sql.fromList([sql.raw("COALESCE(JSON_UNQUOTE(JSON_EXTRACT("), pages.seo, sql.raw(", '$.noindex')), 'false') <> 'true'")])

export function createMysqlSitemapRepository(): ActorScoped<SitemapOperations> {
  return mysqlPolicy<SitemapOperations>({
    async counts(actor, storeId) {
      requireStore(actor, storeId)
      const db = await database()
      const [[productCount], [collectionCount], [pageCount]] = await Promise.all([
        db.select({ total: count() }).from(products, { forceIndex: "products_sitemap" }).where(and(eq(products.storeId, actor.storeId), eq(products.status, "active"))),
        db.select({ total: count() }).from(collections).where(and(eq(collections.storeId, actor.storeId), notInArray(collections.slug, dedicated))),
        db.select({ total: count() }).from(pages, { forceIndex: "pages_sitemap" }).where(and(eq(pages.storeId, actor.storeId), eq(pages.published, 1), indexablePage)),
      ])
      return { products: productCount.total, collections: collectionCount.total, pages: pageCount.total }
    },
    async page(actor, storeId, kind, index) {
      requireStore(actor, storeId)
      if (!Number.isSafeInteger(index) || index < 0 || index > Math.floor(Number.MAX_SAFE_INTEGER / SITEMAP_PAGE_SIZE)) throw new DomainError("validation", "Invalid sitemap page.")
      const db = await database(), offset = index * SITEMAP_PAGE_SIZE
      if (kind === "products") {
        const firstImage = db.select({ url: productImages.url }).from(productImages, { forceIndex: "product_images_sitemap" }).where(eq(productImages.productId, products.id)).orderBy(asc(productImages.position), productImages.id).limit(1)
        const rows = await db.select({ slug: products.slug, modified: products.publishedAt, image: sql.fromList([sql.raw("("), firstImage.getSQL(), sql.raw(")")]).mapWith((value): string | null => value === null ? null : String(value)) }).from(products, { forceIndex: "products_sitemap" }).where(and(eq(products.storeId, actor.storeId), eq(products.status, "active"))).orderBy(products.id).limit(SITEMAP_PAGE_SIZE).offset(offset)
        return rows.map((row) => ({ ...row, modified: isoDate(row.modified) }))
      }
      if (kind === "collections") {
        const rows = await db.select({ slug: collections.slug }).from(collections).where(and(eq(collections.storeId, actor.storeId), notInArray(collections.slug, dedicated))).orderBy(collections.slug).limit(SITEMAP_PAGE_SIZE).offset(offset)
        return rows.map((row) => ({ ...row, modified: null, image: null }))
      }
      if (kind !== "pages") throw new DomainError("validation", "Invalid sitemap kind.")
      const rows = await db.select({ slug: pages.slug, modified: pages.updatedAt }).from(pages, { forceIndex: "pages_sitemap" }).where(and(eq(pages.storeId, actor.storeId), eq(pages.published, 1), indexablePage)).orderBy(pages.slug).limit(SITEMAP_PAGE_SIZE).offset(offset)
      return rows.map((row) => ({ ...row, modified: isoDate(row.modified), image: null }))
    },
  })
}
