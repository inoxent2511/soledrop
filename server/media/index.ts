import "server-only"

import { adminService } from "@/server/admin"
import { selectRepository } from "@/server/db/driver"
import { createFixturesMediaRepository } from "@/server/media/fixtures.repository"
import { createMediaService } from "@/server/media/service"
import { createSupabaseMediaRepository } from "@/server/media/supabase.repository"
import { catalogRepository } from "@/server/catalog"

const repository = selectRepository({ fixtures: createFixturesMediaRepository, supabase: createSupabaseMediaRepository })

export const mediaService = () =>
  createMediaService({
    media: repository(),
    audit: (staff, meta, entry) => adminService().recordAudit(staff, meta, entry),
    usage: async (storeId, url) => {
      const { products } = await catalogRepository().searchProducts(storeId, { page: 1, pageSize: 10_000 })
      return products.filter((product) => product.images.some((image) => image.url === url)).map((product) => product.slug)
    },
  })

export { mediaUrl, type MediaItem } from "@/server/media/types"
export type { MediaView } from "@/server/media/service"
