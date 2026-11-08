import type { OrderStatus } from "@/server/orders/types"

/**
 * Legal order transitions shared by service and transactional repositories, so no client
 * can skip a step. The pre-migration transition contract remains an independent test fixture.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to)
}

/** Stock goes back on the shelf when an order is cancelled before it leaves the warehouse. */
export function restocksOnTransition(from: OrderStatus, to: OrderStatus): boolean {
  return to === "cancelled" && from !== "shipped" && from !== "delivered"
}

/** Shopper-facing labels and the step index used by the order timeline. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  processing: "Being packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
}

/** Customers may cancel themselves only before packing starts. */
export function customerCanCancel(status: OrderStatus): boolean {
  return status === "pending_payment" || status === "confirmed"
}

/** Returns can be requested within 7 days of delivery (store policy). */
export function customerCanRequestReturn(status: OrderStatus, deliveredAt: string | null, at = Date.now()): boolean {
  return status === "delivered" && deliveredAt !== null && at - Date.parse(deliveredAt) <= 7 * 24 * 60 * 60 * 1000
}
