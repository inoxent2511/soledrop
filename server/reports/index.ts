import "server-only"
import { staffService } from "@/server/db/staff-service"

import { refreshStorefront } from "@/server/shared/revalidate"
import { adminService } from "@/server/admin"
import { catalogRepository, staffCatalog } from "@/server/catalog"
import { cartRepository, cartService } from "@/server/cart"
import { contentRepository } from "@/server/content"
import { customerRepository, staffCustomers } from "@/server/customers"
import { inventory } from "@/server/inventory"
import { createStaffMarketing } from "@/server/marketing/staff"
import { orderService, staffOrders } from "@/server/orders"
import { platform } from "@/server/platform"
import { drainOutbox } from "@/server/platform/events"
import { envOverrides } from "@/server/platform/flags"
import { createStaffPlatform } from "@/server/platform/staff"
import { pricing } from "@/server/pricing"
import { createInsights } from "@/server/reports/insights"
import { createReports } from "@/server/reports/service"
import { searchRepository } from "@/server/search"
import { createStaffSearch } from "@/server/search/staff"

/** Admin A8 wiring: reports, marketing and search tools on top of the domain repositories. */

const audit = (
  ...args: Parameters<ReturnType<typeof adminService>["recordAudit"]>
) => adminService().recordAudit(...args)

export const reports = () =>
  staffService(createReports({
    orders: orderService(),
    products: async (storeId) => {
      const products = []
      for (let page = 1; ; page++) {
        const rows = await catalogRepository().reportProducts(storeId, page)
        products.push(...rows)
        if (rows.length < 1000) return products
      }
    },
    levels: (variantIds) => inventory().reportLevels(variantIds),
    pricing: pricing(),
    audit: (staff, meta, entry) => audit(staff, meta, entry),
  }))

export const staffMarketing = () =>
  staffService(createStaffMarketing({
    content: contentRepository(),
    carts: cartRepository(),
    products: (variantIds) =>
      catalogRepository().getProductsByVariantIds(variantIds),
    customer: (id) => customerRepository().findById(id),
    pricing: pricing(),
    audit: (staff, meta, entry) => audit(staff, meta, entry),
    assertSteppedUp: (staff) => adminService().assertSteppedUp(staff),
  }))

export const staffSearch = () =>
  staffService(createStaffSearch({
    search: searchRepository(),
    audit: (staff, meta, entry) => audit(staff, meta, entry),
    revalidate: () => refreshStorefront(),
  }))

export const staffPlatform = () =>
  staffService(createStaffPlatform({
    platform: platform(),
    audit: (staff, meta, entry) => audit(staff, meta, entry),
    jobs: {
      outbox: async () => ({ ...(await drainOutbox()) }),
      "release-reservations": async () => ({ released: await inventory().releaseExpired() }),
      "purge-carts": async () => ({ purged: await cartService().purgeAbandoned(30) }),
    },
    overrides: envOverrides,
    paymentProviders: () => orderService().providers(),
    revalidate: () => refreshStorefront(),
  }))

export const insights = () => staffService(createInsights({ orders: staffOrders(), catalog: staffCatalog(), customers: staffCustomers(), platform: platform() }))
