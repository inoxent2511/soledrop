import type { ActorScoped } from "@/server/db/actor"
import type { Promotion, PromotionRedemption } from "@/server/promotions/types"

export interface PromotionOperations {
  listActive(storeId: string): Promise<Promotion[]>
  /** Redemption counts per promotion for a shopper (by customer id or, for guests, email). */
  redemptionsFor(storeId: string, shopper: { customerId: string | null; email: string | null }): Promise<Map<string, number>>
  /** Number of non-cancelled orders already placed by this shopper (first-order rules). */
  orderCountFor(storeId: string, shopper: { customerId: string | null; email: string | null }): Promise<number>

  // ─── Staff (admin A5) ─────────────────────────────────────────────────────
  listAll(storeId: string): Promise<Promotion[]>
  find(storeId: string, id: string): Promise<Promotion | null>
  /** Creates or updates by id; a code is unique per store (case-insensitive). `timesUsed` is never written. */
  save(promotion: Promotion): Promise<Promotion>
  /** Deletes a promotion nobody has redeemed; a used one can only be switched off. */
  remove(storeId: string, id: string): Promise<void>
  redemptions(promotionId: string, limit: number): Promise<PromotionRedemption[]>
}

/** Raw storage boundary; services receive explicitly bound operations. */
export type PromotionRepository = ActorScoped<PromotionOperations>
