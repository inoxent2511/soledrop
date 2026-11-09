import type { MetadataRoute } from "next"

import { siteConfig } from "@/lib/site"
import { sitemapLocations } from "@/server/storefront/sitemaps"

export const dynamic = "force-dynamic"

/** Crawl the shop; keep personal and transactional paths (and the API) out of search. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/cart", "/checkout", "/account", "/orders/", "/search", "/newsletter/"] },
    sitemap: await sitemapLocations(),
    host: siteConfig.url,
  }
}
