import type { MetadataRoute } from "next"

import { serverSiteUrl } from "@/lib/site-server"
import { entitySitemap, sitemapCounts, SITEMAP_PAGE_SIZE } from "@/server/storefront/sitemaps"

/** Read committed catalogue metadata on every crawl. */
export const dynamic = "force-dynamic"

const url = (path: string) => new URL(path, serverSiteUrl()).toString()

/** Every indexable page: fixed pages, collections, active products and content pages not marked noindex. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const counts = await sitemapCounts()
  const entities = await Promise.all((["collections", "products", "pages"] as const).map((kind) => counts[kind] <= SITEMAP_PAGE_SIZE ? entitySitemap(kind) : []))

  const daily = new Set(["/", "/pre-loved", "/sale"])
  const fixed = ["/", "/pre-loved", "/sale", "/reviews", "/contact", "/faq", "/size-guide", "/condition-guide", "/terms", "/privacy", "/shipping", "/returns"].map((path) => ({
    url: url(path),
    changeFrequency: daily.has(path) ? ("daily" as const) : ("monthly" as const),
    priority: path === "/" ? 1 : 0.6,
  }))

  return [...fixed, ...entities.flat()]
}
