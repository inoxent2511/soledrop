import type { Cart } from "@/server/cart/types"

/** How far the bag is from free delivery, or null when the store has no free-delivery threshold. */
export type FreeDeliveryProgress = {
  threshold: number
  remaining: number
  ratio: number
}

/**
 * Progress towards free delivery, measured on the subtotal after discounts, the same figure the
 * delivery rate's `freeOver` is checked against at checkout (so the bar never promises more).
 */
export function freeDeliveryProgress(
  cart: Pick<Cart, "freeShippingThreshold" | "totals">
): FreeDeliveryProgress | null {
  const threshold = cart.freeShippingThreshold
  if (threshold === null || threshold <= 0) return null
  const spent = cart.totals.subtotal - cart.totals.discount
  return {
    threshold,
    remaining: Math.max(0, threshold - spent),
    ratio: Math.min(1, Math.max(0, spent / threshold)),
  }
}

/** What sale prices take off the bag: compare-at minus price, per pair, for every line on sale. */
export function saleSavings(cart: Pick<Cart, "lines">): number {
  return cart.lines.reduce(
    (sum, line) =>
      line.compareAt && line.compareAt > line.unitPrice
        ? sum + (line.compareAt - line.unitPrice) * line.quantity
        : sum,
    0
  )
}
