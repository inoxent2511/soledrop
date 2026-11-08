import "server-only"

import type { CatalogOperations as DomainOperations } from "@/server/catalog/repository"
import { createMysqlCatalogRepository } from "@/server/catalog/mysql.repository"
import { staffService } from "@/server/db/staff-service"

import { refreshStorefront } from "@/server/shared/revalidate"
import { adminService } from "@/server/admin"
import { createFixturesCatalogRepository } from "@/server/catalog/fixtures.repository"
import { createStaffCatalog } from "@/server/catalog/staff"
import { createCatalogService } from "@/server/catalog/service"
import { dataDriver, localService, selectRepository } from "@/server/db/driver"
import { assertMediaReferences } from "@/server/media/validate"
import { inventory } from "@/server/inventory"
import { pricing } from "@/server/pricing"
import { searchService } from "@/server/search"
import { createMysqlStorefrontRepository } from "./storefront.mysql.repository"
import { bindActor } from "@/server/db/bind"
import { currentActor } from "@/server/db/context"
import { applicablePriceLists } from "@/server/pricing/service"
import type { StorefrontQueries } from "./storefront.repository"

const repository = selectRepository<DomainOperations>({ mysql: createMysqlCatalogRepository,
  fixtures: createFixturesCatalogRepository,
})

export const catalog = () =>
  createCatalogService({
    catalog: repository(),
    pricing: pricing(),
    inventory: inventory(),
    synonyms: (storeId) => searchService().synonymMap(storeId),
    ...(dataDriver() === "mysql" ? {
      selectPage: async (query, context) => {
        const [lists, groups, collections] = await Promise.all([pricing().priceLists(context.storeId), searchService().synonymMap(context.storeId), repository().listCollections(context.storeId)])
        return bindActor<StorefrontQueries>(createMysqlStorefrontRepository(), currentActor).selectPage(context.storeId, query, applicablePriceLists(lists, context).map((list) => list.id), collections.find((collection) => collection.slug === query.collection), groups)
      },
      indexedVocabulary: (storeId) => bindActor<StorefrontQueries>(createMysqlStorefrontRepository(), currentActor).vocabulary(storeId),
      selectRelated: (product, context, limit) => bindActor<StorefrontQueries>(createMysqlStorefrontRepository(), currentActor).related(context.storeId, product, limit),
    } : {}),
  })
/** The raw catalogue repository, for staff operations that see every status (server/catalog/staff.ts). */
export const catalogRepository = repository

/** Staff catalogue operations; a save refreshes every cached storefront page (ISR) at once. */
export const staffCatalog = () =>
  staffService(localService(createStaffCatalog({
    assertImages: assertMediaReferences,
    catalog: repository(),
    pricing: pricing(),
    inventory: inventory(),
    audit: (staff, meta, entry) =>
      adminService().recordAudit(staff, meta, entry),
    revalidate: () => refreshStorefront(),
  }), ["saveProduct", "setStatus", "deleteProduct", "createBrand", "saveCollection", "deleteCollection", "adjustStock"]))
export type * from "@/server/catalog/types"
