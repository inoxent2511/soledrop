import type { createFixturesShippingRepository } from "@/server/shipping/fixtures.repository"
import type { createMysqlShippingRepository } from "@/server/shipping/mysql.repository"
import type { createFixturesSearchRepository } from "@/server/search/fixtures.repository"
import type { createMysqlSearchRepository } from "@/server/search/mysql.repository"
import type { createFixturesPromotionRepository } from "@/server/promotions/fixtures.repository"
import type { createMysqlPromotionRepository } from "@/server/promotions/mysql.repository"
import type { createFixturesPricingRepository } from "@/server/pricing/fixtures.repository"
import type { createMysqlPricingRepository } from "@/server/pricing/mysql.repository"
import type { createFixturesPlatformRepository } from "@/server/platform/fixtures.repository"
import type { createMysqlPlatformRepository } from "@/server/platform/mysql.repository"
import type { createFixturesOrderRepository } from "@/server/orders/fixtures.repository"
import type { createMysqlOrderRepository } from "@/server/orders/mysql.repository"
import type { createFixturesMediaRepository } from "@/server/media/fixtures.repository"
import type { createMysqlMediaRepository } from "@/server/media/mysql.repository"
import type { createFixturesInventoryRepository } from "@/server/inventory/fixtures.repository"
import type { createMysqlInventoryRepository } from "@/server/inventory/mysql.repository"
import type { createFixturesContentRepository } from "@/server/content/fixtures.repository"
import type { createMysqlContentRepository } from "@/server/content/mysql.repository"
import type { createFixturesCatalogRepository } from "@/server/catalog/fixtures.repository"
import type { createMysqlCatalogRepository } from "@/server/catalog/mysql.repository"
import type { createFixturesCartRepository } from "@/server/cart/fixtures.repository"
import type { createMysqlCartRepository } from "@/server/cart/mysql.repository"
import type { createFixturesAdminRepository } from "@/server/admin/fixtures.repository"
import type { createMysqlAdminRepository } from "@/server/admin/mysql.repository"
import { describe, expectTypeOf, it } from "vitest"
import type { createMysqlStorefrontRepository } from "@/server/catalog/storefront.mysql.repository"
import type { StorefrontRepository } from "@/server/catalog/storefront.repository"
import type { RefundIntentRepository } from "@/server/orders/refund-intents.repository"
import type { createFixturesRefundIntentsRepository } from "@/server/orders/refund-intents.fixtures.repository"
import type { createMysqlRefundIntentsRepository } from "@/server/orders/refund-intents.mysql.repository"
import type { CustomerAuthRepository } from "@/server/customers/auth"
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
    expectTypeOf<RequiredActors<StorefrontRepository>>().toEqualTypeOf<true>()
    expectTypeOf<RequiredActors<RefundIntentRepository>>().toEqualTypeOf<true>()
    expectTypeOf<ReturnType<typeof createFixturesRefundIntentsRepository>>().toEqualTypeOf<RefundIntentRepository>()
    expectTypeOf<ReturnType<typeof createMysqlRefundIntentsRepository>>().toEqualTypeOf<RefundIntentRepository>()
    expectTypeOf<RequiredActors<CustomerAuthRepository>>().toEqualTypeOf<true>()
    expectTypeOf<ReturnType<typeof createMysqlStorefrontRepository>>().toEqualTypeOf<StorefrontRepository>()
  })
  it("keeps all twenty-six storage factories behind the required-actor contract", () => {
    expectTypeOf<ReturnType<typeof createFixturesAdminRepository>>().toEqualTypeOf<AdminRepository>()
    expectTypeOf<ReturnType<typeof createMysqlAdminRepository>>().toEqualTypeOf<AdminRepository>()
    expectTypeOf<ReturnType<typeof createFixturesCartRepository>>().toEqualTypeOf<CartRepository>()
    expectTypeOf<ReturnType<typeof createMysqlCartRepository>>().toEqualTypeOf<CartRepository>()
    expectTypeOf<ReturnType<typeof createFixturesCatalogRepository>>().toEqualTypeOf<CatalogRepository>()
    expectTypeOf<ReturnType<typeof createMysqlCatalogRepository>>().toEqualTypeOf<CatalogRepository>()
    expectTypeOf<ReturnType<typeof createFixturesContentRepository>>().toEqualTypeOf<ContentRepository>()
    expectTypeOf<ReturnType<typeof createMysqlContentRepository>>().toEqualTypeOf<ContentRepository>()
    expectTypeOf<ReturnType<typeof createFixturesInventoryRepository>>().toEqualTypeOf<InventoryRepository>()
    expectTypeOf<ReturnType<typeof createMysqlInventoryRepository>>().toEqualTypeOf<InventoryRepository>()
    expectTypeOf<ReturnType<typeof createFixturesMediaRepository>>().toEqualTypeOf<MediaRepository>()
    expectTypeOf<ReturnType<typeof createMysqlMediaRepository>>().toEqualTypeOf<MediaRepository>()
    expectTypeOf<ReturnType<typeof createFixturesOrderRepository>>().toEqualTypeOf<OrderRepository>()
    expectTypeOf<ReturnType<typeof createMysqlOrderRepository>>().toEqualTypeOf<OrderRepository>()
    expectTypeOf<ReturnType<typeof createFixturesPlatformRepository>>().toEqualTypeOf<PlatformRepository>()
    expectTypeOf<ReturnType<typeof createMysqlPlatformRepository>>().toEqualTypeOf<PlatformRepository>()
    expectTypeOf<ReturnType<typeof createFixturesPricingRepository>>().toEqualTypeOf<PricingRepository>()
    expectTypeOf<ReturnType<typeof createMysqlPricingRepository>>().toEqualTypeOf<PricingRepository>()
    expectTypeOf<ReturnType<typeof createFixturesPromotionRepository>>().toEqualTypeOf<PromotionRepository>()
    expectTypeOf<ReturnType<typeof createMysqlPromotionRepository>>().toEqualTypeOf<PromotionRepository>()
    expectTypeOf<ReturnType<typeof createFixturesSearchRepository>>().toEqualTypeOf<SearchRepository>()
    expectTypeOf<ReturnType<typeof createMysqlSearchRepository>>().toEqualTypeOf<SearchRepository>()
    expectTypeOf<ReturnType<typeof createFixturesShippingRepository>>().toEqualTypeOf<ShippingRepository>()
    expectTypeOf<ReturnType<typeof createMysqlShippingRepository>>().toEqualTypeOf<ShippingRepository>()
    expectTypeOf<ReturnType<typeof createFixturesCustomerRepository>>().toEqualTypeOf<CustomerRepository>()
    expectTypeOf<ReturnType<typeof createMysqlCustomerRepository>>().toEqualTypeOf<CustomerRepository>()
  })
})
