import type { ActorScoped } from "@/server/db/actor"
import type { Product, ProductStatus } from "@/server/catalog/types"
export type StockRequest = { variantId: string; quantity: number }

export type StockLevelRow = { variantId: string; onHand: number; reserved: number }
export type StockMovement = { id: string; variantId: string; delta: number; reason: string; actor: string; at: string }
export type StockPageQuery = { q?: string; low?: number; page: number; pageSize: number }
export type StockPageRow = { variantId: string; productId: string; title: string; status: ProductStatus; sku: string; size: Product["variants"][number]["size"]; onHand: number; reserved: number; available: number }

export interface InventoryOperations {
  /** Complete staff inventory, paginated without hydrating product graphs. */
  search(storeId: string, query: StockPageQuery): Promise<{ rows: StockPageRow[]; total: number }>
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
  /** Product projection; no movement history or adjustment authority. */
  catalogueLevels(variantIds: string[]): Promise<StockLevelRow[]>
  /** The adjustment ledger, newest first. */
  movements(variantIds: string[], limit: number): Promise<StockMovement[]>
}

/** Raw storage boundary; services receive explicitly bound operations. */
export type InventoryRepository = ActorScoped<InventoryOperations>
