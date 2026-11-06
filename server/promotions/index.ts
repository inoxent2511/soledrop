import "server-only"

import { refreshStorefront } from "@/server/shared/revalidate"
import { adminService } from "@/server/admin"
import { selectRepository } from "@/server/db/driver"
import { orderService } from "@/server/orders"
import { createFixturesPromotionRepository } from "@/server/promotions/fixtures.repository"
import { createStaffPromotions } from "@/server/promotions/staff"
import { createSupabasePromotionRepository } from "@/server/promotions/supabase.repository"

export const promotionsRepository = selectRepository({
  fixtures: createFixturesPromotionRepository,
  supabase: createSupabasePromotionRepository,
})
export { evaluatePromotions, ineligibility } from "@/server/promotions/evaluate"
export type {
  Promotion,
  PromotionAction,
  PromotionCondition,
} from "@/server/promotions/types"

/** Staff (admin) promotion operations. */
export const staffPromotions = () =>
  createStaffPromotions({
    promotions: promotionsRepository(),
    orderNumber: async (orderId) =>
      (await orderService().findById(orderId))?.number ?? null,
    audit: (staff, meta, entry) =>
      adminService().recordAudit(staff, meta, entry),
    revalidate: () => refreshStorefront(),
  })
