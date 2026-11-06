import type { MetadataRoute } from "next"

import { siteConfig } from "@/lib/site"
import { catalog } from "@/server/catalog"
import { contentService } from "@/server/content"
import { currentStoreId } from "@/server/db/driver"
import { DEDICATED_COLLECTION_PAGES } from "@/server/storefront"

/** Rebuilt hourly: new drops and sold pre-loved pairs reach search engines within the hour. */
export const revalidate = 3600

const url = (path: string) => new URL(path, siteConfig.url).toString()

/** Every indexable page: fixed pages, collections, active products and content pages not marked noindex. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const storeId = currentStoreId()
  const service = catalog()
  const [collections, products, pages] = await Promise.all([service.collections(storeId), service.allProducts(storeId), contentService().pages(storeId)])

  const daily = new Set(["/", "/pre-loved", "/sale"])
  const fixed = ["/", "/pre-loved", "/sale", "/contact", "/faq", "/size-guide", "/condition-guide", "/terms", "/privacy", "/shipping", "/returns"].map((path) => ({
    url: url(path),
    changeFrequency: daily.has(path) ? ("daily" as const) : ("monthly" as const),
    priority: path === "/" ? 1 : 0.6,
  }))

  return [
    ...fixed,
    ...collections
      .filter((collection) => !DEDICATED_COLLECTION_PAGES[collection.slug])
      .map((collection) => ({ url: url(`/collections/${collection.slug}`), changeFrequency: "daily" as const, priority: 0.8 })),
    ...products
      .filter((product) => product.status === "active")
      .map((product) => ({
        url: url(`/products/${product.slug}`),
        lastModified: product.publishedAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
        images: product.images.slice(0, 1).map((image) => url(image.url)),
      })),
    ...pages.filter((page) => !page.seo.noindex).map((page) => ({ url: url(`/pages/${page.slug}`), lastModified: page.updatedAt, changeFrequency: "yearly" as const, priority: 0.3 })),
  ]
}
