import "server-only"

import type { ShippingOperations as DomainOperations } from "@/server/shipping/repository"
import { createMysqlShippingRepository } from "@/server/shipping/mysql.repository"
import { staffService } from "@/server/db/staff-service"

import { refreshStorefront } from "@/server/shared/revalidate"
import { adminService } from "@/server/admin"
import { localService, selectRepository } from "@/server/db/driver"
import { createFixturesShippingRepository } from "@/server/shipping/fixtures.repository"
import { createStaffShipping } from "@/server/shipping/staff"

export const shippingRepository = selectRepository<DomainOperations>({ mysql: createMysqlShippingRepository,
  fixtures: createFixturesShippingRepository,
})
export {
  quoteRates,
  taxFor,
  taxRateFor,
  zoneFor,
} from "@/server/shipping/calculate"
export type {
  ShippingQuote,
  ShippingRate,
  ShippingZone,
  TaxRate,
} from "@/server/shipping/types"

/** Staff (admin) shipping and tax operations. */
export const staffShipping = () =>
  staffService(localService(createStaffShipping({
    shipping: shippingRepository(),
    audit: (staff, meta, entry) =>
      adminService().recordAudit(staff, meta, entry),
    revalidate: () => refreshStorefront(),
  }), ["saveZone", "deleteZone", "saveTaxRates"]))
