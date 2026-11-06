import type { ShippingZone, TaxRate } from "@/server/shipping/types"

export interface ShippingRepository {
  listZones(storeId: string): Promise<ShippingZone[]>
  listTaxRates(storeId: string): Promise<TaxRate[]>

  // ─── Staff (admin A5) ─────────────────────────────────────────────────────
  /** save_shipping_zone: the zone and all its rates in one transaction (rates replaced). */
  saveZone(storeId: string, zone: ShippingZone): Promise<ShippingZone>
  deleteZone(storeId: string, id: string): Promise<void>
  /** replace_tax_rates: the store's tax table, replaced as a whole. */
  replaceTaxRates(storeId: string, rates: TaxRate[]): Promise<TaxRate[]>
}
