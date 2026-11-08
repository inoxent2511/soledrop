import type { ActorScoped } from "@/server/db/actor"
import type { ExchangeRates, PriceList, PriceRow } from "@/server/pricing/types"

export interface PricingOperations {
  listPriceLists(storeId: string): Promise<PriceList[]>
  listPrices(variantIds: string[]): Promise<PriceRow[]>
  getExchangeRates(storeId: string): Promise<ExchangeRates>
  /** Insert or replace rows by (price list, variant). Used by imports. */
  upsertPrices(rows: PriceRow[]): Promise<number>
}

/** Raw storage boundary; services receive explicitly bound operations. */
export type PricingRepository = ActorScoped<PricingOperations>
