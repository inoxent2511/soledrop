import { describe, expectTypeOf, it } from "vitest"
import type { Actor } from "@/server/db/actor"
import type { AdminRepository } from "@/server/admin/repository"
import type { CartRepository } from "@/server/cart/repository"
import type { CatalogRepository } from "@/server/catalog/repository"
import type { ContentRepository } from "@/server/content/repository"
import type { CustomerRepository } from "@/server/customers/repository"
import type { InventoryRepository } from "@/server/inventory/repository"
import type { MediaRepository } from "@/server/media/repository"
import type { OrderRepository } from "@/server/orders/repository"
import type { PlatformRepository } from "@/server/platform/repository"
import type { PricingRepository } from "@/server/pricing/repository"
import type { PromotionRepository } from "@/server/promotions/repository"
import type { SearchRepository } from "@/server/search/repository"
import type { ShippingRepository } from "@/server/shipping/repository"
import type { createFixturesCustomerRepository } from "@/server/customers/fixtures.repository"
import type { createMysqlCustomerRepository } from "@/server/customers/mysql.repository"

type RequiredActors<T> = { [K in keyof T]: T[K] extends (...args: infer A) => unknown ? A extends [Actor, ...unknown[]] ? true : false : false }[keyof T] extends true ? true : false
type Repositories = [AdminRepository, CartRepository, CatalogRepository, ContentRepository, CustomerRepository, InventoryRepository, MediaRepository, OrderRepository, PlatformRepository, PricingRepository, PromotionRepository, SearchRepository, ShippingRepository]
type EveryRepository<T extends readonly object[]> = T extends [infer First extends object, ...infer Rest extends object[]] ? RequiredActors<First> extends true ? EveryRepository<Rest> : false : true

describe("required raw actor types", () => {
  it("requires the actor on every operation in all thirteen repository interfaces", () => {
    expectTypeOf<EveryRepository<Repositories>>().toEqualTypeOf<true>()
  })
  it("keeps both customer storage factories behind the required-actor contract", () => {
    expectTypeOf<ReturnType<typeof createFixturesCustomerRepository>>().toEqualTypeOf<CustomerRepository>()
    expectTypeOf<ReturnType<typeof createMysqlCustomerRepository>>().toEqualTypeOf<CustomerRepository>()
  })
})
