import "server-only"
import { and, asc, count, eq, gte, inArray, lt } from "drizzle-orm"
import { type Actor, requireGrant, requireStore } from "@/server/db/actor"
import { database } from "@/server/db/client"
import { orderLines, orderPromotionCodes, orders } from "@/server/db/schema"
import { isoDate, sqlDate } from "@/server/db/values"
import type { SalesOrder, SalesOrderPage, SalesOrderQuery } from "./types"
import { validateSalesQuery } from "./sales"

/** A reporting capability reads financial columns without granting access to orders or PII. */
export async function searchSales(actor: Actor, storeId: string, query: SalesOrderQuery): Promise<SalesOrderPage> {
  requireStore(actor, storeId); requireGrant(actor, "reports:read")
  validateSalesQuery(query)
  const db = await database(), where = and(eq(orders.storeId, actor.storeId), query.placedFrom ? gte(orders.placedAt, sqlDate(query.placedFrom)) : undefined, query.placedTo ? lt(orders.placedAt, sqlDate(query.placedTo)) : undefined)
  const [rows, [total]] = await Promise.all([
    db.select({ id: orders.id, placedAt: orders.placedAt, status: orders.status, total: orders.total, refundedTotal: orders.refundedTotal, paymentMethod: orders.paymentMethod }).from(orders, { forceIndex: "orders_store_placed_asc" }).where(where).orderBy(asc(orders.placedAt), orders.id).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
    db.select({ value: count() }).from(orders).where(where),
  ])
  if (!rows.length) return { orders: [], total: total.value }
  const ids = rows.map((row) => row.id), [lines, codes] = await Promise.all([
    db.select({ orderId: orderLines.orderId, productId: orderLines.productId, title: orderLines.title, brand: orderLines.brand, kind: orderLines.kind, quantity: orderLines.quantity, total: orderLines.total }).from(orderLines).where(inArray(orderLines.orderId, ids)).orderBy(orderLines.position),
    db.select().from(orderPromotionCodes).where(inArray(orderPromotionCodes.id, ids)).orderBy(orderPromotionCodes.position),
  ])
  return { total: total.value, orders: rows.map(({ id, ...row }): SalesOrder => ({ ...row, placedAt: isoDate(row.placedAt), status: row.status as SalesOrder["status"], promotionCodes: codes.filter((code) => code.id === id).map((code) => code.value), lines: lines.filter((line) => line.orderId === id).map(({ orderId: _order, ...line }) => ({ ...line, kind: line.kind as "new" | "preloved" })) })) }
}
