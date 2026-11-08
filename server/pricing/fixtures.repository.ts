import "server-only"

import { db, transaction } from "@/server/fixtures/store"
import type { PricingOperations } from "@/server/pricing/repository"
import { DomainError } from "@/server/shared/errors"

export function createFixturesPricingRepository(): PricingOperations {
  return {
    async listPriceLists() {
      return db().priceLists
    },
    async listPrices(variantIds) {
      const wanted = new Set(variantIds)
      return db().prices.filter((price) => wanted.has(price.variantId))
    },
    async getExchangeRates() {
      return db().exchangeRates
    },
    async upsertPrices(rows) {
      return transaction((tables) => {
        for (const row of rows) {
          if (!Number.isInteger(row.amount) || row.amount < 0) throw new DomainError("validation", `Invalid price for variant ${row.variantId}.`)
          const existing = tables.prices.find((price) => price.priceListId === row.priceListId && price.variantId === row.variantId)
          if (existing) Object.assign(existing, row)
          else tables.prices.push({ ...row })
        }
        return rows.length
      })
    },
  }
}
