import "server-only"

import type { VariantPrice } from "@/server/catalog/types"
import type { PricingOperations } from "@/server/pricing/repository"
import type { PriceList, PriceRow } from "@/server/pricing/types"
import type { CurrencyCode } from "@/server/shared/money"

export type PricingContext = { storeId: string; customerGroup: string | null; at?: Date }

/** True when the list applies to this shopper at this moment. */
function listApplies(list: PriceList, context: PricingContext): boolean {
  const at = (context.at ?? new Date()).getTime()
  if (list.customerGroup !== null && list.customerGroup !== context.customerGroup) return false
  if (list.startsAt && Date.parse(list.startsAt) > at) return false
  if (list.endsAt && Date.parse(list.endsAt) <= at) return false
  return true
}

export const applicablePriceLists = (lists: PriceList[], context: PricingContext) => lists.filter((list) => listApplies(list, context)).sort((a, b) => b.priority - a.priority)

/**
 * Resolves the price of each variant: among applicable price lists that price it, the highest
 * priority wins. Prices are never accepted from the client — carts and orders call this.
 */
export function resolvePrices(lists: PriceList[], rows: PriceRow[], variantIds: string[], context: PricingContext): Map<string, VariantPrice> {
  const applicable = applicablePriceLists(lists, context)
  const result = new Map<string, VariantPrice>()
  for (const variantId of variantIds) {
    for (const list of applicable) {
      const row = rows.find((price) => price.variantId === variantId && price.priceListId === list.id)
      if (row) {
        result.set(variantId, { variantId, amount: row.amount, compareAt: row.compareAt, currency: list.currency })
        break
      }
    }
  }
  return result
}

export function createPricingService(repository: PricingOperations) {
  return {
    async pricesFor(variantIds: string[], context: PricingContext) {
      const [lists, rows] = await Promise.all([repository.listPriceLists(context.storeId), repository.listPrices(variantIds)])
      return resolvePrices(lists, rows, variantIds, context)
    },
    /** Approximate display conversion (multi-currency display flag); never used to charge. */
    async convertForDisplay(storeId: string, amount: number, to: CurrencyCode): Promise<number> {
      const rates = await repository.getExchangeRates(storeId)
      const rate = rates.rates[to]
      if (!rate) return amount
      return Math.round(amount * rate)
    },
    exchangeRates: (storeId: string) => repository.getExchangeRates(storeId),
    priceLists: (storeId: string) => repository.listPriceLists(storeId),
    rawPrices: (variantIds: string[]) => repository.listPrices(variantIds),
    upsertPrices: (rows: PriceRow[]) => repository.upsertPrices(rows),
  }
}

export type PricingService = ReturnType<typeof createPricingService>
