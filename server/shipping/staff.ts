import "server-only"

import type { TaxRateInput, ZoneInput } from "@/features/admin/shipping/schema"
import type { Permission } from "@/server/admin/permissions"
import type { RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import { DomainError } from "@/server/shared/errors"
import { newId } from "@/server/shared/ids"
import { quoteRates, taxFor, taxRateFor, zoneFor } from "@/server/shipping/calculate"
import type { ShippingRepository } from "@/server/shipping/repository"
import type { ShippingZone } from "@/server/shipping/types"

/**
 * Staff shipping and tax (admin A5): zones with their delivery options and free-over thresholds,
 * the tax table, and a tester that quotes with the same functions checkout uses
 * (server/shipping/calculate.ts).
 */

type Audit = (staff: StaffContext, meta: RequestMeta, entry: { action: string; entity: string; entityId: string; before?: unknown; after?: unknown; reason?: string | null; storeId: string }) => Promise<void>

const need = (staff: StaffContext, permission: Permission) => {
  if (!staff.permissions.includes(permission)) throw new DomainError("forbidden", "You don't have permission to do that.", { permission })
}

export function createStaffShipping(deps: { shipping: ShippingRepository; audit: Audit; revalidate: () => void }) {
  const { shipping } = deps

  return {
    async overview(staff: StaffContext) {
      need(staff, "shipping:read")
      const [zones, taxRates] = await Promise.all([shipping.listZones(staff.member.storeId), shipping.listTaxRates(staff.member.storeId)])
      return { zones: [...zones].sort((a, b) => a.position - b.position), taxRates }
    },

    async saveZone(staff: StaffContext, meta: RequestMeta, input: ZoneInput, id?: string) {
      need(staff, "shipping:write")
      const zones = await shipping.listZones(staff.member.storeId)
      const before = id ? zones.find((zone) => zone.id === id) : undefined
      if (id && !before) throw new DomainError("not_found", "Zone not found.")
      const zone: ShippingZone = { id: before?.id ?? newId(), ...input, cities: input.cities.map((city) => city.toLowerCase()) }
      const saved = await shipping.saveZone(staff.member.storeId, zone)
      await deps.audit(staff, meta, { action: before ? "shipping_zone.updated" : "shipping_zone.created", entity: "shipping_zone", entityId: saved.id, before: before ?? undefined, after: saved, storeId: staff.member.storeId })
      deps.revalidate()
      return saved
    },

    async deleteZone(staff: StaffContext, meta: RequestMeta, id: string) {
      need(staff, "shipping:write")
      const zones = await shipping.listZones(staff.member.storeId)
      const before = zones.find((zone) => zone.id === id)
      if (!before) throw new DomainError("not_found", "Zone not found.")
      if (zones.length === 1) throw new DomainError("conflict", "The store needs at least one shipping zone.")
      await shipping.deleteZone(staff.member.storeId, id)
      await deps.audit(staff, meta, { action: "shipping_zone.deleted", entity: "shipping_zone", entityId: id, before, storeId: staff.member.storeId })
      deps.revalidate()
    },

    async saveTaxRates(staff: StaffContext, meta: RequestMeta, rates: TaxRateInput[]) {
      need(staff, "shipping:write")
      const before = await shipping.listTaxRates(staff.member.storeId)
      const saved = await shipping.replaceTaxRates(staff.member.storeId, rates)
      await deps.audit(staff, meta, { action: "tax_rates.updated", entity: "tax_rates", entityId: staff.member.storeId, before, after: saved, storeId: staff.member.storeId })
      deps.revalidate()
      return saved
    },

    /** What a shopper in this city would be offered for this basket (discounted subtotal). */
    async test(staff: StaffContext, input: { country: string; city: string; province?: string; subtotal: number }) {
      need(staff, "shipping:read")
      const [zones, taxRates] = await Promise.all([shipping.listZones(staff.member.storeId), shipping.listTaxRates(staff.member.storeId)])
      const zone = zoneFor(zones, input.country, input.city)
      const rate = taxRateFor(taxRates, input.country, input.province)
      return {
        zone: zone ? { id: zone.id, name: zone.name } : null,
        quotes: zone ? quoteRates(zone, input.subtotal, false) : [],
        tax: { label: rate?.label ?? null, basisPoints: rate?.basisPoints ?? 0, ...taxFor(input.subtotal, rate) },
      }
    },
  }
}

export type StaffShipping = ReturnType<typeof createStaffShipping>
