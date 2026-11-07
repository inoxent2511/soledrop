import "server-only"

import { and, asc, eq, exists, getTableColumns, inArray, or, sql } from "drizzle-orm"
import type { Order, OrderLine, Payment, Refund, ReturnRequest } from "./types"
import { type Actor, requireGrant, requireSystem, systemActor } from "@/server/db/actor"
import type { Database } from "@/server/db/client"
import { constant, maskedEmail, maskedPhone } from "@/server/db/query.repository"
import { auditLog, carts, orderLines, orderNumberSequences, orderPromotionCodes, orders, outboxEvents, payments, refunds, returns, stores, inventoryLevels } from "@/server/db/schema"
import { isoDate, jsonValue, sqlDate } from "@/server/db/values"
import { uuidv7 } from "@/server/db/uuid"
import { lockLevels } from "@/server/inventory/mysql.repository"
import type { EventTopic } from "@/server/platform/types"
import { DomainError } from "@/server/shared/errors"
import { serverEnv } from "@/lib/env.server"
import { sealDeliveryPayload } from "@/server/platform/private-payload"

export function orderOwnerScope(db: Database, actor: Actor, permission: "orders:read" | "customers:read" = "orders:read") {
  if (actor.kind === "staff" || actor.kind === "system") { requireGrant(actor, permission); return undefined }
  const token = actor.orderAccessTokenHash ? eq(orders.accessTokenHash, actor.orderAccessTokenHash) : undefined
  const own = actor.kind === "customer" ? eq(orders.customerId, actor.id) : undefined
  const cart = actor.cartTokenHash ? exists(db.select({ id: carts.id }).from(carts).where(and(eq(carts.id, orders.checkoutCartId), eq(carts.storeId, actor.storeId), eq(carts.tokenHash, actor.cartTokenHash), actor.kind === "customer" ? or(eq(carts.customerId, actor.id), sql.fromList([carts.customerId, sql.raw(" IS NULL")])) : sql.fromList([carts.customerId, sql.raw(" IS NULL")])))) : undefined
  const lookup = actor.kind === "anonymous" && actor.orderLookup ? and(eq(orders.number, actor.orderLookup.number), eq(orders.email, actor.orderLookup.email.trim().toLowerCase())) : undefined
  if (!token && !own && !cart && !lookup) throw new DomainError("forbidden", "You don't have access to this order.")
  return or(token, own, cart, lookup)
}

export function orderProjection(actor: Actor) {
  const pii = actor.kind !== "staff" || actor.permissions.includes("customers:read_pii")
  const maskedAddress = sql.fromList([sql.raw("JSON_OBJECT('fullName', SUBSTRING_INDEX(JSON_UNQUOTE(JSON_EXTRACT("), orders.shippingAddress,
    sql.raw(", '$.fullName')), ' ', 1), 'phone', "), maskedPhone(orders.phone),
    sql.raw(", 'line1', '•••', 'line2', IF(JSON_EXTRACT("), orders.shippingAddress, sql.raw(", '$.line2') IS NULL, NULL, '•••'), 'postalCode', IF(JSON_EXTRACT("), orders.shippingAddress,
    sql.raw(", '$.postalCode') IS NULL, NULL, '•••'), 'city', JSON_UNQUOTE(JSON_EXTRACT("), orders.shippingAddress, sql.raw(", '$.city')), 'province', JSON_UNQUOTE(JSON_EXTRACT("), orders.shippingAddress,
    sql.raw(", '$.province')), 'country', JSON_UNQUOTE(JSON_EXTRACT("), orders.shippingAddress, sql.raw(", '$.country')))")]).mapWith((value): unknown => typeof value === "string" ? JSON.parse(value) as unknown : value)
  return { ...getTableColumns(orders), email: pii ? orders.email : maskedEmail(orders.email), phone: pii ? orders.phone : maskedPhone(orders.phone), shippingAddress: pii ? orders.shippingAddress : maskedAddress,
    // Staff never need guest access hashes or a shopper's checkout idempotency key.
    accessTokenHash: actor.kind === "staff" ? constant("") : orders.accessTokenHash, idempotencyKey: actor.kind === "staff" ? constant("") : orders.idempotencyKey }
}

export type OrderRecord = Omit<typeof orders.$inferSelect, "phone"> & { phone: string | null }
export async function hydrateOrders(db: Database, rows: OrderRecord[], lock = false): Promise<Order[]> {
  if (!rows.length) return []
  const ids = rows.map((row) => row.id)
  const lineQuery = db.select().from(orderLines).where(inArray(orderLines.orderId, ids)).orderBy(asc(orderLines.position))
  const codeQuery = db.select().from(orderPromotionCodes).where(inArray(orderPromotionCodes.id, ids)).orderBy(asc(orderPromotionCodes.position))
  const [lines, codes] = await Promise.all([lock ? lineQuery.for("update") : lineQuery, lock ? codeQuery.for("update") : codeQuery])
  return rows.map((row): Order => {
    const address = jsonValue<Order["shippingAddress"]>(row.shippingAddress)
    return { id: row.id, storeId: row.storeId, number: row.number, customerId: row.customerId, email: row.email, phone: row.phone ?? "", status: row.status as Order["status"], paymentStatus: row.paymentStatus as Order["paymentStatus"], fulfillmentStatus: row.fulfillmentStatus as Order["fulfillmentStatus"], currency: row.currency as Order["currency"], subtotal: row.subtotal, discountTotal: row.discountTotal, shippingTotal: row.shippingTotal, taxTotal: row.taxTotal, taxIncluded: row.taxIncluded === 1, total: row.total, refundedTotal: row.refundedTotal, promotionCodes: codes.filter((code) => code.id === row.id).map((code) => code.value), shippingAddress: { ...address, line2: address.line2 ?? undefined, postalCode: address.postalCode ?? undefined }, shippingMethod: jsonValue<Order["shippingMethod"]>(row.shippingMethod), paymentMethod: row.paymentMethod, idempotencyKey: row.idempotencyKey, accessTokenHash: row.accessTokenHash, customFields: jsonValue<Order["customFields"]>(row.customFields), note: row.note, trackingNumber: row.trackingNumber, history: jsonValue<Order["history"]>(row.history), placedAt: isoDate(row.placedAt), updatedAt: isoDate(row.updatedAt),
      lines: lines.filter((line) => line.orderId === row.id).map((line): OrderLine => ({ id: line.id, variantId: line.variantId, productId: line.productId, slug: line.slug, title: line.title, brand: line.brand, kind: line.kind as OrderLine["kind"], condition: line.condition as OrderLine["condition"], size: jsonValue<OrderLine["size"]>(line.size), imageUrl: line.imageUrl, sku: line.sku, quantity: line.quantity, unitPrice: line.unitPrice, compareAt: line.compareAt, discount: line.discount, tax: line.tax, total: line.total, refundedQuantity: line.refundedQuantity })) }
  })
}

export async function lockedOrder(db: Database, actor: Actor, id: string, permission: "orders:read" | "customers:read" = "orders:read") {
  const [row] = await db.select(orderProjection(actor)).from(orders).where(and(eq(orders.storeId, actor.storeId), eq(orders.id, id), orderOwnerScope(db, actor, permission))).for("update")
  if (!row) throw new DomainError("not_found", "Order not found.")
  return (await hydrateOrders(db, [row], true))[0]
}

/** Called only after the order row/store lock is held; counter increments roll back with checkout. */
export async function allocateNumber(db: Database, actor: Actor): Promise<string> {
  const [store] = await db.select().from(stores).where(eq(stores.id, actor.storeId)).for("update")
  if (!store) throw new DomainError("not_found", "Store not found.")
  let [counter] = await db.select().from(orderNumberSequences).where(eq(orderNumberSequences.storeId, actor.storeId)).for("update")
  if (!counter) {
    counter = { storeId: actor.storeId, prefix: store.orderPrefix, nextValue: store.nextOrderNumber }
    await db.insert(orderNumberSequences).values(counter)
  }
  const next = counter.nextValue + 1
  if (!Number.isSafeInteger(next)) throw new DomainError("unavailable", "Order number capacity reached.")
  await db.update(orderNumberSequences).set({ nextValue: next }).where(eq(orderNumberSequences.storeId, actor.storeId))
  await db.update(stores).set({ nextOrderNumber: next }).where(eq(stores.id, actor.storeId))
  return counter.prefix + counter.nextValue
}

export async function enqueueOrderEvent(db: Database, actor: Actor, orderId: string, topic: EventTopic, payload: Record<string, unknown>) {
  // Notification routing is a separate, explicit capability; unprivileged staff projections stay masked.
  const notification = systemActor(actor.storeId, "notifications")
  requireSystem(notification, ["notifications"])
  const [route] = await db.select({ email: orders.email }).from(orders).where(and(eq(orders.storeId, notification.storeId), eq(orders.id, orderId))).limit(1)
  if (!route) throw new DomainError("not_found", "Order not found.")
  await db.insert(outboxEvents).values({ id: uuidv7(), storeId: actor.storeId, topic, payload: sealDeliveryPayload({ ...payload, orderId, email: route.email }, serverEnv.SESSION_SECRET) })
}

export async function auditOrder(db: Database, actor: Actor, action: string, entity: string, entityId: string, before: unknown, after: unknown) {
  await db.insert(auditLog).values({ id: uuidv7(), storeId: actor.storeId, actor: actor.id ?? "customer", action, entity, entityId, before, after })
}

export function payment(row: typeof payments.$inferSelect): Payment { return { ...row, status: row.status as Payment["status"], currency: row.currency as Payment["currency"], createdAt: isoDate(row.createdAt) } }
export function refund(row: typeof refunds.$inferSelect): Refund { return { ...row, lines: jsonValue<Refund["lines"]>(row.lines), restock: row.restock === 1, createdAt: isoDate(row.createdAt) } }
export function returnRequest(row: typeof returns.$inferSelect): ReturnRequest { return { ...row, status: row.status as ReturnRequest["status"], lines: jsonValue<ReturnRequest["lines"]>(row.lines), createdAt: isoDate(row.createdAt) } }

export function quantities(lines: { orderLineId: string; quantity: number }[]) {
  const totals = new Map<string, number>()
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new DomainError("validation", "Invalid quantity.")
    totals.set(line.orderLineId, (totals.get(line.orderLineId) ?? 0) + line.quantity)
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([orderLineId, quantity]) => ({ orderLineId, quantity }))
}

/** Requested quantities are cumulative targets, so return/refund/cancel receipts cannot overlap. */
export async function restockOrderLines(db: Database, actor: Actor, orderId: string, requested: { orderLineId: string; quantity: number }[]) {
  const rows = await db.select().from(orderLines).where(eq(orderLines.orderId, orderId)).orderBy(asc(orderLines.variantId), orderLines.id).for("update")
  const items = quantities(requested)
  const levels = await lockLevels(db, actor, rows.filter((row) => items.some((item) => item.orderLineId === row.id)).map((row) => row.variantId))
  for (const item of items) {
    const line = rows.find((row) => row.id === item.orderLineId)
    if (!line || item.quantity > line.quantity) throw new DomainError("validation", "Restock quantity exceeds the quantity bought.")
    const quantity = Math.max(0, item.quantity - line.restockedQuantity)
    if (quantity === 0) continue
    const level = levels.find((row) => row.variantId === line.variantId)
    if (!level) throw new DomainError("not_found", "Unknown variant.")
    level.onHand += quantity
    await db.update(inventoryLevels).set({ onHand: level.onHand }).where(eq(inventoryLevels.variantId, level.variantId))
    await db.update(orderLines).set({ restockedQuantity: line.restockedQuantity + quantity }).where(and(eq(orderLines.id, line.id), eq(orderLines.orderId, orderId)))
  }
}

export function orderUpdatedAt(previous: string): string { return sqlDate(new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString()) }
