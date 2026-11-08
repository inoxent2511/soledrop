import type { ActorScoped } from "@/server/db/actor"
import type { CartRow } from "@/server/cart/types"

export interface CartOperations {
  findByTokenHash(storeId: string, tokenHash: string): Promise<CartRow | null>
  findById(id: string): Promise<CartRow | null>
  findActiveByCustomer(storeId: string, customerId: string): Promise<CartRow | null>
  create(cart: CartRow): Promise<CartRow>
  /** Replaces lines, codes and owner; bumps updated_at. */
  save(cart: CartRow): Promise<CartRow>
  /** merge_carts: moves the guest cart's lines into the customer's cart (quantities add, capped by stock). */
  merge(guestCartId: string, customerCartId: string): Promise<CartRow>
  /** Deletes abandoned guest carts untouched for `olderThanDays`; returns how many. */
  purgeAbandoned(olderThanDays: number): Promise<number>
  /** Active carts with something in them, untouched for `olderThanHours` (admin A8), newest first. */
  listAbandoned(storeId: string, query: { olderThanHours: number; page: number; pageSize: number }): Promise<{ carts: CartRow[]; total: number }>
}

/** Raw storage boundary; services receive explicitly bound operations. */
export type CartRepository = ActorScoped<CartOperations>
