import type { ActorScoped } from "@/server/db/actor"
export type StockRequest = { variantId: string; quantity: number }

export type StockLevelRow = { variantId: string; onHand: number; reserved: number }
export type StockMovement = { id: string; variantId: string; delta: number; reason: string; actor: string; at: string }

export interface InventoryOperations {
  /** Available = on hand − reserved by other carts (a cart's own reservation counts as available to it). */
  availability(variantIds: string[], forCartId?: string): Promise<Map<string, number>>
  /** reserve_stock: replaces the cart's reservations atomically; throws out_of_stock if any line can't be held. */
  reserve(cartId: string, items: StockRequest[], ttlMinutes: number): Promise<void>
  release(cartId: string): Promise<void>
  /** Physical stock per variant (exports, absolute stock imports). */
  onHand(variantIds: string[]): Promise<Map<string, number>>
  /** release_expired_reservations: returns how many reservations were released. */
  releaseExpired(): Promise<number>
  /** Manual stock adjustment (import, admin); refuses to take on-hand below reserved or zero. */
  adjust(variantId: string, delta: number, reason: string, actor: string): Promise<number>
  /** On hand and reserved per variant (admin inventory). */
  levels(variantIds: string[]): Promise<StockLevelRow[]>
  /** Report projection; does not grant access to stock adjustments or movement history. */
  reportLevels(variantIds: string[]): Promise<StockLevelRow[]>
  /** The adjustment ledger, newest first. */
  movements(variantIds: string[], limit: number): Promise<StockMovement[]>
}

/** Raw storage boundary; services receive explicitly bound operations. */
export type InventoryRepository = ActorScoped<InventoryOperations>
