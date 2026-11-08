import "server-only"

import { supabase, unwrap } from "@/server/db/supabase"
import type { ShippingOperations } from "@/server/shipping/repository"
import type { ShippingRate, ShippingZone, TaxRate } from "@/server/shipping/types"
import { DomainError } from "@/server/shared/errors"

export function createSupabaseShippingRepository(): ShippingOperations {
  return {
    async listZones(storeId) {
      const rows = unwrap(
        await supabase()
          .from("shipping_zones")
          .select("id, name, countries, cities, position, shipping_rates(code, label, amount, free_over, min_days, max_days, cash_on_delivery)")
          .eq("store_id", storeId)
          .order("position"),
      ) as {
        id: string
        name: string
        countries: string[]
        cities: string[]
        position: number
        shipping_rates: { code: string; label: string; amount: number; free_over: number | null; min_days: number; max_days: number; cash_on_delivery: boolean }[]
      }[]
      return rows.map(
        (row): ShippingZone => ({
          id: row.id,
          name: row.name,
          countries: row.countries,
          cities: row.cities,
          position: row.position,
          rates: row.shipping_rates.map(
            (rate): ShippingRate => ({
              code: rate.code,
              label: rate.label,
              amount: Number(rate.amount),
              freeOver: rate.free_over === null ? null : Number(rate.free_over),
              minDays: rate.min_days,
              maxDays: rate.max_days,
              cashOnDelivery: rate.cash_on_delivery,
            }),
          ),
        }),
      )
    },
    async listTaxRates(storeId) {
      const rows = unwrap(
        await supabase().from("tax_rates").select("country, province, label, basis_points, inclusive").eq("store_id", storeId),
      ) as { country: string; province: string | null; label: string; basis_points: number; inclusive: boolean }[]
      return rows.map((row): TaxRate => ({ country: row.country, province: row.province, label: row.label, basisPoints: row.basis_points, inclusive: row.inclusive }))
    },
    async saveZone(storeId, zone) {
      unwrap(
        await supabase().rpc("save_shipping_zone", {
          p_store_id: storeId,
          p_zone: { id: zone.id, name: zone.name, countries: zone.countries, cities: zone.cities, position: zone.position },
          p_rates: zone.rates.map((rate) => ({ code: rate.code, label: rate.label, amount: rate.amount, free_over: rate.freeOver, min_days: rate.minDays, max_days: rate.maxDays, cash_on_delivery: rate.cashOnDelivery })),
        }),
      )
      return zone
    },
    async deleteZone(storeId, id) {
      const deleted = unwrap(await supabase().from("shipping_zones").delete().eq("store_id", storeId).eq("id", id).select("id")) as { id: string }[]
      if (!deleted.length) throw new DomainError("not_found", "Zone not found.")
    },
    async replaceTaxRates(storeId, rates) {
      unwrap(await supabase().rpc("replace_tax_rates", { p_store_id: storeId, p_rates: rates.map((rate) => ({ country: rate.country, province: rate.province, label: rate.label, basis_points: rate.basisPoints, inclusive: rate.inclusive })) }))
      return rates
    },
  }
}
