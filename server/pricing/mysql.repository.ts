import "server-only"

import { and, eq, inArray } from "drizzle-orm"
import type { PricingRepository } from "./repository"
import type { ExchangeRates, PriceList } from "./types"
import { type ActorScoped, requireGrant, requireStore } from "@/server/db/actor"
import { database, withTransaction } from "@/server/db/client"
import { exchangeRates, priceLists, prices, products, variants } from "@/server/db/schema"
import { isoDate, jsonValue, nullableIsoDate } from "@/server/db/values"
import { DomainError } from "@/server/shared/errors"

export function createMysqlPricingRepository(): ActorScoped<PricingRepository> {
  return {
    async listPriceLists(actor, storeId) {
      requireStore(actor, storeId)
      const db = await database()
      const rows = await db.select().from(priceLists).where(eq(priceLists.storeId, actor.storeId))
      return rows.map((row): PriceList => ({ id: row.id, code: row.code, currency: row.currency as PriceList["currency"], customerGroup: row.customerGroup, priority: row.priority, startsAt: nullableIsoDate(row.startsAt), endsAt: nullableIsoDate(row.endsAt) }))
    },
    async listPrices(actor, variantIds) {
      if (!variantIds.length) return []
      const db = await database()
      return db.select({ priceListId: prices.priceListId, variantId: prices.variantId, amount: prices.amount, compareAt: prices.compareAt }).from(prices)
        .innerJoin(priceLists, eq(priceLists.id, prices.priceListId)).innerJoin(variants, eq(variants.id, prices.variantId)).innerJoin(products, eq(products.id, variants.productId))
        .where(and(eq(products.storeId, actor.storeId), eq(priceLists.storeId, actor.storeId), inArray(prices.variantId, variantIds)))
    },
    async getExchangeRates(actor, storeId) {
      requireStore(actor, storeId)
      const db = await database()
      const [row] = await db.select().from(exchangeRates).where(eq(exchangeRates.storeId, actor.storeId)).limit(1)
      if (!row) throw new DomainError("unavailable", "The store's currency configuration is missing.")
      return { base: row.base as ExchangeRates["base"], rates: jsonValue<ExchangeRates["rates"]>(row.rates), updatedAt: isoDate(row.updatedAt) }
    },
    async upsertPrices(actor, rows) {
      requireGrant(actor, "pricing:write")
      return withTransaction(async (db) => {
        for (const row of [...rows].sort((a, b) => a.variantId.localeCompare(b.variantId) || a.priceListId.localeCompare(b.priceListId))) {
          const [list] = await db.select({ id: priceLists.id }).from(priceLists).where(and(eq(priceLists.id, row.priceListId), eq(priceLists.storeId, actor.storeId))).for("update")
          const [variant] = await db.select({ id: variants.id }).from(variants).innerJoin(products, eq(products.id, variants.productId)).where(and(eq(variants.id, row.variantId), eq(products.storeId, actor.storeId))).for("update")
          if (!list || !variant) throw new DomainError("not_found", "Price list or product not found.")
          await db.insert(prices).values(row).onDuplicateKeyUpdate({ set: { amount: row.amount, compareAt: row.compareAt } })
        }
        return rows.length
      })
    },
  }
}
