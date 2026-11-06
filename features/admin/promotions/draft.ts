import type { PromotionDraft } from "@/features/admin/promotions/components/promotion-editor"
import type { Promotion } from "@/server/promotions/types"

/** ISO → the `datetime-local` value in Pakistan time (UTC+5). */
const toLocal = (iso: string | null) => (iso ? new Date(Date.parse(iso) + 5 * 3_600_000).toISOString().slice(0, 16) : "")

export const toDraft = (promotion: Promotion): PromotionDraft => ({
  id: promotion.id,
  title: promotion.title,
  code: promotion.code,
  conditions: promotion.conditions,
  actions: promotion.actions,
  startsAt: toLocal(promotion.startsAt),
  endsAt: toLocal(promotion.endsAt),
  usageLimit: promotion.usageLimit,
  perCustomerLimit: promotion.perCustomerLimit,
  active: promotion.active,
  combinable: promotion.combinable,
  timesUsed: promotion.timesUsed,
})

export const blankDraft: PromotionDraft = { title: "", code: null, conditions: [], actions: [{ type: "percent_off_order", basisPoints: 1000 }], startsAt: "", endsAt: "", usageLimit: null, perCustomerLimit: null, active: true, combinable: false }

/** One line describing what a promotion does, for lists. */
export function describe(promotion: Pick<Promotion, "actions">): string {
  return promotion.actions
    .map((action) =>
      action.type === "percent_off_order" ? `${action.basisPoints / 100}% off the order` : action.type === "fixed_off_order" ? `Rs. ${(action.amount / 100).toLocaleString("en-US")} off` : action.type === "percent_off_items" ? `${action.basisPoints / 100}% off ${action.kind === "preloved" ? "pre-loved pairs" : action.kind === "new" ? "brand-new pairs" : "pairs"}` : "Free delivery",
    )
    .join(" + ")
}
