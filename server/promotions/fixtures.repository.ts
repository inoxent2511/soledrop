import "server-only"
import { fixturePolicy } from "@/server/db/fixtures-policy.repository"
import { promotionGuards, promotionProjections } from "@/server/db/fixture-guards.repository"

import { db, transaction } from "@/server/fixtures/store"
import { DomainError } from "@/server/shared/errors"
import type { PromotionOperations, PromotionRepository } from "@/server/promotions/repository"

const matchesShopper = (order: { customerId: string | null; email: string }, shopper: { customerId: string | null; email: string | null }) =>
  (shopper.customerId !== null && order.customerId === shopper.customerId) ||
  (shopper.email !== null && order.email.toLowerCase() === shopper.email.toLowerCase())

export function createFixturesPromotionRepository(): PromotionRepository {
  const operations: PromotionOperations = {
    async listActive(storeId) {
      return structuredClone(db().promotions.filter((promotion) => promotion.storeId === storeId && promotion.active))
    },
    async redemptionsFor(storeId, shopper) {
      const tables = db()
      const counts = new Map<string, number>()
      for (const redemption of tables.promotionRedemptions) {
        const order = tables.orders.find((row) => row.id === redemption.orderId && row.storeId === storeId)
        if (order && matchesShopper(order, shopper)) counts.set(redemption.promotionId, (counts.get(redemption.promotionId) ?? 0) + 1)
      }
      return counts
    },
    async orderCountFor(storeId, shopper) {
      return db().orders.filter((order) => order.storeId === storeId && order.status !== "cancelled" && matchesShopper(order, shopper)).length
    },
    async listAll(storeId) {
      return structuredClone(db().promotions.filter((promotion) => promotion.storeId === storeId))
    },
    async find(storeId, id) {
      return structuredClone(db().promotions.find((promotion) => promotion.storeId === storeId && promotion.id === id) ?? null)
    },
    async save(promotion) {
      return transaction((tables) => {
        if (promotion.code && tables.promotions.some((row) => row.storeId === promotion.storeId && row.id !== promotion.id && row.code?.toUpperCase() === promotion.code?.toUpperCase())) {
          throw new DomainError("conflict", "Another promotion already uses this code.")
        }
        const index = tables.promotions.findIndex((row) => row.storeId === promotion.storeId && row.id === promotion.id)
        const saved = { ...structuredClone(promotion), timesUsed: index === -1 ? 0 : tables.promotions[index].timesUsed }
        if (index === -1) tables.promotions.push(saved)
        else tables.promotions[index] = saved
        return structuredClone(saved)
      })
    },
    async remove(storeId, id) {
      transaction((tables) => {
        const promotion = tables.promotions.find((row) => row.storeId === storeId && row.id === id)
        if (!promotion) throw new DomainError("not_found", "Promotion not found.")
        if (promotion.timesUsed > 0 || tables.promotionRedemptions.some((row) => row.promotionId === id)) throw new DomainError("conflict", "This promotion has been used, so it can only be switched off.")
        tables.promotions = tables.promotions.filter((row) => row !== promotion)
      })
    },
    async redemptions(promotionId, limit) {
      return structuredClone(db().promotionRedemptions.filter((row) => row.promotionId === promotionId).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit))
    },
  }
  return fixturePolicy<PromotionOperations>(operations, promotionGuards, promotionProjections)
}
