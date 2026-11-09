import "server-only"
import type { MetadataRoute } from "next"
import { serverSiteUrl } from "@/lib/site-server"
import { anonymousActor } from "@/server/db/actor"
import { currentStoreId, dataDriver } from "@/server/db/driver"
import { catalog } from "@/server/catalog"
import { contentService } from "@/server/content"
import { createMysqlSitemapRepository, SITEMAP_PAGE_SIZE, type SitemapCounts, type SitemapKind, type SitemapRow } from "./sitemap.repository"

const repository = createMysqlSitemapRepository()
const url = (path: string) => new URL(path, serverSiteUrl()).toString()
const kinds: SitemapKind[] = ["collections", "products", "pages"]
const dedicated = new Set(["pre-loved", "sale"])

async function fixtureRows(kind: SitemapKind): Promise<SitemapRow[]> {
  const storeId = currentStoreId()
  if (kind === "products") return (await catalog().allProducts(storeId)).filter((row) => row.status === "active").map((row) => ({ slug: row.slug, modified: row.publishedAt, image: row.images[0]?.url ?? null }))
  if (kind === "collections") return (await catalog().collections(storeId)).filter((row) => !dedicated.has(row.slug)).map((row) => ({ slug: row.slug, modified: null, image: null }))
  return (await contentService().pages(storeId)).filter((row) => !row.seo.noindex).map((row) => ({ slug: row.slug, modified: row.updatedAt, image: null }))
}

/** Counts and projections avoid loading product descriptions, variants or stock. */
export async function sitemapCounts(): Promise<SitemapCounts> {
  if (dataDriver() === "mysql") { const id = currentStoreId(); return repository.counts(anonymousActor(id), id) }
  const [collections, products, pages] = await Promise.all(kinds.map(fixtureRows))
  return { collections: collections.length, products: products.length, pages: pages.length }
}

export async function entitySitemap(kind: SitemapKind, index = 0): Promise<MetadataRoute.Sitemap> {
  if (!Number.isSafeInteger(index) || index < 0) return []
  const storeId = currentStoreId()
  const rows = dataDriver() === "mysql" ? await repository.page(anonymousActor(storeId), storeId, kind, index) : (await fixtureRows(kind)).slice(index * SITEMAP_PAGE_SIZE, (index + 1) * SITEMAP_PAGE_SIZE)
  return rows.map((row) => ({ url: url(`/${kind}/${row.slug}`), ...(row.modified ? { lastModified: row.modified } : {}), changeFrequency: kind === "products" ? "weekly" as const : kind === "collections" ? "daily" as const : "yearly" as const, priority: kind === "products" ? 0.7 : kind === "collections" ? 0.8 : 0.3, ...(row.image ? { images: [url(row.image)] } : {}) }))
}

/** Small stores retain /sitemap.xml; large entities are discoverable in robots.txt. */
export async function sitemapLocations(): Promise<string[]> {
  const counts = await sitemapCounts()
  return [url("/sitemap.xml"), ...kinds.flatMap((kind) => counts[kind] > SITEMAP_PAGE_SIZE ? Array.from({ length: Math.ceil(counts[kind] / SITEMAP_PAGE_SIZE) }, (_, index) => url(`/${kind}/sitemap/${index}.xml`)) : [])]
}

export async function sitemapIds(kind: SitemapKind): Promise<{ id: number }[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") return []
  const total = (await sitemapCounts())[kind]
  return total > SITEMAP_PAGE_SIZE ? Array.from({ length: Math.ceil(total / SITEMAP_PAGE_SIZE) }, (_, id) => ({ id })) : []
}

export { SITEMAP_PAGE_SIZE }
