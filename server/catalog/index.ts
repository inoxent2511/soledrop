import "server-only"

import { refreshStorefront } from "@/server/shared/revalidate"
import { adminService } from "@/server/admin"
import { createFixturesCatalogRepository } from "@/server/catalog/fixtures.repository"
import { createStaffCatalog } from "@/server/catalog/staff"
import { createCatalogService } from "@/server/catalog/service"
import { createSupabaseCatalogRepository } from "@/server/catalog/supabase.repository"
import { localService, selectRepository } from "@/server/db/driver"
import { assertMediaReferences } from "@/server/media/validate"
import { inventory } from "@/server/inventory"
import { pricing } from "@/server/pricing"
import { searchService } from "@/server/search"

const repository = selectRepository({
  fixtures: createFixturesCatalogRepository,
  supabase: createSupabaseCatalogRepository,
})

export const catalog = () =>
  createCatalogService({
    catalog: repository(),
    pricing: pricing(),
    inventory: inventory(),
    synonyms: (storeId) => searchService().synonymMap(storeId),
  })
/** The raw catalogue repository, for staff operations that see every status (server/catalog/staff.ts). */
export const catalogRepository = repository

/** Staff catalogue operations; a save refreshes every cached storefront page (ISR) at once. */
export const staffCatalog = () =>
  localService(createStaffCatalog({
    assertImages: assertMediaReferences,
    catalog: repository(),
    pricing: pricing(),
    inventory: inventory(),
    audit: (staff, meta, entry) =>
      adminService().recordAudit(staff, meta, entry),
    revalidate: () => refreshStorefront(),
  }))
export type * from "@/server/catalog/types"
