import "server-only"

import { supabase, unwrap } from "@/server/db/supabase"
import type { PricingOperations } from "@/server/pricing/repository"
import type { ExchangeRates, PriceList, PriceRow } from "@/server/pricing/types"

export function createSupabasePricingRepository(): PricingOperations {
  return {
    async listPriceLists(storeId) {
      const rows = unwrap(
        await supabase().from("price_lists").select("id, code, currency, customer_group, priority, starts_at, ends_at").eq("store_id", storeId),
      ) as { id: string; code: string; currency: PriceList["currency"]; customer_group: string | null; priority: number; starts_at: string | null; ends_at: string | null }[]
      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        currency: row.currency,
        customerGroup: row.customer_group,
        priority: row.priority,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
      }))
    },
    async listPrices(variantIds) {
      if (variantIds.length === 0) return []
      const rows = unwrap(
        await supabase().from("prices").select("price_list_id, variant_id, amount, compare_at").in("variant_id", variantIds),
      ) as { price_list_id: string; variant_id: string; amount: number; compare_at: number | null }[]
      return rows.map((row): PriceRow => ({ priceListId: row.price_list_id, variantId: row.variant_id, amount: Number(row.amount), compareAt: row.compare_at === null ? null : Number(row.compare_at) }))
    },
    async getExchangeRates(storeId) {
      const row = unwrap(
        await supabase().from("exchange_rates").select("base, rates, updated_at").eq("store_id", storeId).single(),
      ) as { base: ExchangeRates["base"]; rates: ExchangeRates["rates"]; updated_at: string }
      return { base: row.base, rates: row.rates, updatedAt: row.updated_at }
    },
    async upsertPrices(rows) {
      unwrap(
        await supabase()
          .from("prices")
          .upsert(
            rows.map((row) => ({ price_list_id: row.priceListId, variant_id: row.variantId, amount: row.amount, compare_at: row.compareAt })),
            { onConflict: "price_list_id,variant_id" },
          ),
      )
      return rows.length
    },
  }
}
