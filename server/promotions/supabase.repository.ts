import "server-only"

import { supabase, unwrap } from "@/server/db/supabase"
import type { PromotionOperations } from "@/server/promotions/repository"
import type { Promotion } from "@/server/promotions/types"
import { DomainError } from "@/server/shared/errors"

type PromotionRecord = {
  id: string
  store_id: string
  code: string | null
  title: string
  conditions: Promotion["conditions"]
  actions: Promotion["actions"]
  starts_at: string | null
  ends_at: string | null
  usage_limit: number | null
  per_customer_limit: number | null
  times_used: number
  active: boolean
  combinable: boolean
}

const toPromotion = (row: PromotionRecord): Promotion => ({
  id: row.id,
  storeId: row.store_id,
  code: row.code,
  title: row.title,
  conditions: row.conditions,
  actions: row.actions,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  usageLimit: row.usage_limit,
  perCustomerLimit: row.per_customer_limit,
  timesUsed: row.times_used,
  active: row.active,
  combinable: row.combinable,
})

export function createSupabasePromotionRepository(): PromotionOperations {
  return {
    async listActive(storeId) {
      const rows = unwrap(await supabase().from("promotions").select("*").eq("store_id", storeId).eq("active", true)) as PromotionRecord[]
      return rows.map(toPromotion)
    },
    async redemptionsFor(storeId, shopper) {
      const rows = unwrap(
        await supabase().rpc("promotion_redemption_counts", { p_store_id: storeId, p_customer_id: shopper.customerId, p_email: shopper.email }),
      ) as { promotion_id: string; redemptions: number }[]
      return new Map(rows.map((row) => [row.promotion_id, row.redemptions]))
    },
    async orderCountFor(storeId, shopper) {
      return unwrap(
        await supabase().rpc("shopper_order_count", { p_store_id: storeId, p_customer_id: shopper.customerId, p_email: shopper.email }),
      ) as number
    },

    async listAll(storeId) {
      const rows = unwrap(await supabase().from("promotions").select("*").eq("store_id", storeId).order("title")) as PromotionRecord[]
      return rows.map(toPromotion)
    },
    async find(storeId, id) {
      const row = unwrap(await supabase().from("promotions").select("*").eq("store_id", storeId).eq("id", id).maybeSingle()) as PromotionRecord | null
      return row ? toPromotion(row) : null
    },
    async save(promotion) {
      // times_used is written only by place_order; an upsert never resets it.
      const row = unwrap(
        await supabase()
          .from("promotions")
          .upsert(
            {
              id: promotion.id,
              store_id: promotion.storeId,
              code: promotion.code,
              title: promotion.title,
              conditions: promotion.conditions,
              actions: promotion.actions,
              starts_at: promotion.startsAt,
              ends_at: promotion.endsAt,
              usage_limit: promotion.usageLimit,
              per_customer_limit: promotion.perCustomerLimit,
              active: promotion.active,
              combinable: promotion.combinable,
            },
            { onConflict: "id" },
          )
          .select("*")
          .single(),
      ) as PromotionRecord
      return toPromotion(row)
    },
    async remove(storeId, id) {
      const used = unwrap(await supabase().from("promotion_redemptions").select("id").eq("promotion_id", id).limit(1)) as { id: string }[]
      if (used.length) throw new DomainError("conflict", "This promotion has been used, so it can only be switched off.")
      const deleted = unwrap(await supabase().from("promotions").delete().eq("store_id", storeId).eq("id", id).eq("times_used", 0).select("id")) as { id: string }[]
      if (!deleted.length) throw new DomainError("conflict", "This promotion has been used, so it can only be switched off.")
    },
    async redemptions(promotionId, limit) {
      const rows = unwrap(await supabase().from("promotion_redemptions").select("promotion_id, order_id, email, at").eq("promotion_id", promotionId).order("at", { ascending: false }).limit(limit)) as {
        promotion_id: string
        order_id: string
        email: string
        at: string
      }[]
      return rows.map((row) => ({ promotionId: row.promotion_id, orderId: row.order_id, email: row.email, at: row.at }))
    },
  }
}
