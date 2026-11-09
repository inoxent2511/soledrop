import type { MetadataRoute } from "next"
import { entitySitemap, sitemapIds } from "@/server/storefront/sitemaps"

export const dynamic = "force-dynamic"
export const generateSitemaps = () => sitemapIds("collections")

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const value = await id
  return /^(0|[1-9]\d*)$/.test(value) ? entitySitemap("collections", Number(value)) : []
}
