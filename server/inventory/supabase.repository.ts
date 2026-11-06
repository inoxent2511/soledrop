import "server-only"

import { supabase, unwrap } from "@/server/db/supabase"
import type { InventoryRepository } from "@/server/inventory/repository"

export function createSupabaseInventoryRepository(): InventoryRepository {
  return {
    async availability(variantIds, forCartId) {
      if (variantIds.length === 0) return new Map()
      const rows = unwrap(
        await supabase().rpc("stock_availability", { p_variant_ids: variantIds, p_cart_id: forCartId ?? null }),
      ) as { variant_id: string; available: number }[]
      return new Map(rows.map((row) => [row.variant_id, row.available]))
    },
    async reserve(cartId, items, ttlMinutes) {
      unwrap(
        await supabase().rpc("reserve_stock", {
          p_cart_id: cartId,
          p_items: items.map((item) => ({ variant_id: item.variantId, quantity: item.quantity })),
          p_ttl_minutes: ttlMinutes,
        }),
      )
    },
    async release(cartId) {
      unwrap(await supabase().from("inventory_reservations").delete().eq("cart_id", cartId))
    },
    async onHand(variantIds) {
      if (variantIds.length === 0) return new Map()
      const rows = unwrap(await supabase().from("inventory_levels").select("variant_id, on_hand").in("variant_id", variantIds)) as { variant_id: string; on_hand: number }[]
      return new Map(rows.map((row) => [row.variant_id, row.on_hand]))
    },
    async releaseExpired() {
      return unwrap(await supabase().rpc("release_expired_reservations")) as number
    },
    async adjust(variantId, delta, reason, actor) {
      return unwrap(
        await supabase().rpc("adjust_stock", { p_variant_id: variantId, p_delta: delta, p_reason: reason, p_actor: actor }),
      ) as number
    },
    async levels(variantIds) {
      if (variantIds.length === 0) return []
      const rows = unwrap(await supabase().from("inventory_levels").select("variant_id, on_hand, reserved").in("variant_id", variantIds)) as { variant_id: string; on_hand: number; reserved: number }[]
      return rows.map((row) => ({ variantId: row.variant_id, onHand: row.on_hand, reserved: row.reserved }))
    },
    async movements(variantIds, limit) {
      if (variantIds.length === 0) return []
      const rows = unwrap(await supabase().from("inventory_movements").select("id, variant_id, delta, reason, actor, at").in("variant_id", variantIds).order("at", { ascending: false }).limit(limit)) as { id: string; variant_id: string; delta: number; reason: string; actor: string; at: string }[]
      return rows.map((row) => ({ id: row.id, variantId: row.variant_id, delta: row.delta, reason: row.reason, actor: row.actor, at: row.at }))
    },
  }
}
