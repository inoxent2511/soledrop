import type { Order, SalesOrder, SalesOrderQuery } from "./types"
import { DomainError } from "@/server/shared/errors"

export function validateSalesQuery(query: SalesOrderQuery) {
  if (!Number.isSafeInteger(query.page) || query.page < 1 || !Number.isSafeInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 1000 || query.page > Math.floor(Number.MAX_SAFE_INTEGER / query.pageSize)) throw new DomainError("validation", "Invalid sales report page.")
}

/** The fixture and native reporting paths expose the same financial fields. */
export function salesOrder(order: Order): SalesOrder {
  return { placedAt: order.placedAt, status: order.status, total: order.total, refundedTotal: order.refundedTotal, paymentMethod: order.paymentMethod, promotionCodes: [...order.promotionCodes], lines: order.lines.map(({ productId, title, brand, kind, quantity, total }) => ({ productId, title, brand, kind, quantity, total })) }
}
