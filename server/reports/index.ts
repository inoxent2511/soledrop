import "server-only"

import { refreshStorefront } from "@/server/shared/revalidate"
import { adminService } from "@/server/admin"
import { catalogRepository } from "@/server/catalog"
import { cartRepository } from "@/server/cart"
import { contentRepository } from "@/server/content"
import { customerRepository } from "@/server/customers"
import { inventory } from "@/server/inventory"
import { createStaffMarketing } from "@/server/marketing/staff"
import { orderService } from "@/server/orders"
import { pricing } from "@/server/pricing"
import { createReports } from "@/server/reports/service"
import { searchRepository } from "@/server/search"
import { createStaffSearch } from "@/server/search/staff"

/** Admin A8 wiring: reports, marketing and search tools on top of the domain repositories. */

const audit = (
  ...args: Parameters<ReturnType<typeof adminService>["recordAudit"]>
) => adminService().recordAudit(...args)

export const reports = () =>
  createReports({
    orders: orderService(),
    products: async (storeId) =>
      (
        await catalogRepository().searchProducts(storeId, {
          page: 1,
          pageSize: 100_000,
        })
      ).products,
    levels: (variantIds) => inventory().levels(variantIds),
    pricing: pricing(),
    audit: (staff, meta, entry) => audit(staff, meta, entry),
  })

export const staffMarketing = () =>
  createStaffMarketing({
    content: contentRepository(),
    carts: cartRepository(),
    products: (variantIds) =>
      catalogRepository().getProductsByVariantIds(variantIds),
    customer: (id) => customerRepository().findById(id),
    pricing: pricing(),
    audit: (staff, meta, entry) => audit(staff, meta, entry),
    assertSteppedUp: (staff) => adminService().assertSteppedUp(staff),
  })

export const staffSearch = () =>
  createStaffSearch({
    search: searchRepository(),
    audit: (staff, meta, entry) => audit(staff, meta, entry),
    revalidate: () => refreshStorefront(),
  })
