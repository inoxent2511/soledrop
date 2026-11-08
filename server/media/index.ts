import "server-only"
import { createMysqlMediaRepository } from "@/server/media/mysql.repository"
import { staffService } from "@/server/db/staff-service"

import { adminService } from "@/server/admin"
import { localService, selectRepository } from "@/server/db/driver"
import { createFixturesMediaRepository } from "@/server/media/fixtures.repository"
import { createMediaService } from "@/server/media/service"
import { createSupabaseMediaRepository } from "@/server/media/supabase.repository"
import { catalogRepository } from "@/server/catalog"
import { contentRepository } from "@/server/content"

const repository = selectRepository({ mysql: createMysqlMediaRepository,  fixtures: createFixturesMediaRepository, supabase: createSupabaseMediaRepository })
export const mediaRepository = repository

export const mediaService = () =>
  staffService(localService(createMediaService({
    media: repository(),
    audit: (staff, meta, entry) => adminService().recordAudit(staff, meta, entry),
    usage: async (storeId, url) => {
      const used = new Set<string>()
      // Include drafts, archives and every page of the catalogue.
      for (let page = 1; ; page++) {
        const { products, total } = await catalogRepository().searchProducts(storeId, { page, pageSize: 1000 })
        for (const product of products) if (product.images.some((image) => image.url === url)) used.add(`Product: ${product.slug}`)
        if (page * 1000 >= total || !products.length) break
      }
      for (const collection of await catalogRepository().listCollections(storeId)) if (collection.image?.url === url) used.add(`Collection: ${collection.slug}`)
      const home = (await contentRepository().home(storeId))?.content
      if (home && [...home.slides, ...home.instagram.images, ...home.categories.map((category) => category.image)].some((image) => image.src === url)) used.add("Homepage")
      if (await repository().hasOrderUsage(storeId, url)) used.add("Order history")
      return [...used]
    },
  })))

export { mediaUrl, type MediaItem } from "@/server/media/types"
export type { MediaView } from "@/server/media/service"
