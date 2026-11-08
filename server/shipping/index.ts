import "server-only"
import { createMysqlShippingRepository } from "@/server/shipping/mysql.repository"
import { staffService } from "@/server/db/staff-service"

import { refreshStorefront } from "@/server/shared/revalidate"
import { adminService } from "@/server/admin"
import { selectRepository } from "@/server/db/driver"
import { createFixturesShippingRepository } from "@/server/shipping/fixtures.repository"
import { createStaffShipping } from "@/server/shipping/staff"
import { createSupabaseShippingRepository } from "@/server/shipping/supabase.repository"

export const shippingRepository = selectRepository({ mysql: createMysqlShippingRepository,
  fixtures: createFixturesShippingRepository,
  supabase: createSupabaseShippingRepository,
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
  staffService(createStaffShipping({
    shipping: shippingRepository(),
    audit: (staff, meta, entry) =>
      adminService().recordAudit(staff, meta, entry),
    revalidate: () => refreshStorefront(),
  }))
