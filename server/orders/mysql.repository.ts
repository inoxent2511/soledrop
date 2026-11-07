import "server-only"

import { and, asc, count, desc, eq, exists, getTableColumns, gte, inArray, like, lt, or } from "drizzle-orm"
import type { OrderRepository } from "./repository"
import { createMysqlOrderWrites } from "./mysql-writes.repository"
import { hydrateOrders, orderOwnerScope, orderProjection, payment, refund, returnRequest } from "./mysql-helpers.repository"
import { type ActorScoped, requireCustomerOwner, requireGrant, requireStore } from "@/server/db/actor"
import { database } from "@/server/db/client"
import { constant } from "@/server/db/query.repository"
import { orderContacts, orderNotes, orders, payments, refunds, returns } from "@/server/db/schema"
import { escapeLike, isoDate, sqlDate } from "@/server/db/values"

export function createMysqlOrderRepository(): ActorScoped<OrderRepository> {
  return {
    ...createMysqlOrderWrites(),
    async findByNumber(actor, storeId, number) {
      requireStore(actor, storeId)
      const db = await database()
      return (await hydrateOrders(db, await db.select(orderProjection(actor)).from(orders).where(and(eq(orders.storeId, actor.storeId), eq(orders.number, number), orderOwnerScope(db, actor))).limit(1)))[0] ?? null
    },
    async findById(actor, id) {
      const db = await database()
      return (await hydrateOrders(db, await db.select(orderProjection(actor)).from(orders).where(and(eq(orders.storeId, actor.storeId), eq(orders.id, id), orderOwnerScope(db, actor))).limit(1)))[0] ?? null
    },
    async findByIdempotencyKey(actor, storeId, key) {
      requireStore(actor, storeId)
      const db = await database()
      return (await hydrateOrders(db, await db.select(orderProjection(actor)).from(orders).where(and(eq(orders.storeId, actor.storeId), eq(orders.idempotencyKey, key), orderOwnerScope(db, actor))).limit(1)))[0] ?? null
    },
    async listByCustomer(actor, storeId, customerId) {
      requireStore(actor, storeId)
      const permission = actor.permissions.includes("orders:read") ? "orders:read" : "customers:read"
      requireCustomerOwner(actor, customerId, permission)
      const db = await database()
      return hydrateOrders(db, await db.select(orderProjection(actor)).from(orders).where(and(eq(orders.storeId, actor.storeId), eq(orders.customerId, customerId), orderOwnerScope(db, actor, permission))).orderBy(desc(orders.placedAt), orders.id))
    },
    async listByEmail(actor, storeId, email) {
      requireStore(actor, storeId)
      const db = await database()
      return hydrateOrders(db, await db.select(orderProjection(actor)).from(orders).where(and(eq(orders.storeId, actor.storeId), eq(orders.email, email.trim().toLowerCase()), orderOwnerScope(db, actor))).orderBy(desc(orders.placedAt), orders.id))
    },
    async listPayments(actor, orderId) {
      const db = await database()
      const rows = await db.select(getTableColumns(payments)).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).where(and(eq(orders.storeId, actor.storeId), eq(orders.id, orderId), orderOwnerScope(db, actor))).orderBy(asc(payments.createdAt), payments.id)
      return rows.map(payment)
    },
    async listRefunds(actor, orderId) {
      const db = await database()
      const rows = await db.select(getTableColumns(refunds)).from(refunds).innerJoin(orders, eq(orders.id, refunds.orderId)).where(and(eq(orders.storeId, actor.storeId), eq(orders.id, orderId), orderOwnerScope(db, actor))).orderBy(asc(refunds.createdAt), refunds.id)
      return rows.map(refund)
    },
    async listReturns(actor, orderId) {
      const db = await database()
      const rows = await db.select(getTableColumns(returns)).from(returns).innerJoin(orders, eq(orders.id, returns.orderId)).where(and(eq(orders.storeId, actor.storeId), eq(orders.id, orderId), orderOwnerScope(db, actor))).orderBy(asc(returns.createdAt), returns.id)
      return rows.map(returnRequest)
    },
    async search(actor, storeId, query) {
      requireStore(actor, storeId); requireGrant(actor, "orders:read")
      const db = await database()
      const term = query.q?.trim() ? "%" + escapeLike(query.q.trim()) + "%" : null, digits = query.q?.replace(/\D/g, "") ?? ""
      const contacts = term ? exists(db.select({ id: orderContacts.orderId }).from(orderContacts).where(and(eq(orderContacts.orderId, orders.id), eq(orderContacts.storeId, actor.storeId), or(like(orderContacts.recipientName, term), digits.length >= 4 ? like(orderContacts.phoneDigits, "%" + digits + "%") : undefined)))) : undefined
      const where = and(eq(orders.storeId, actor.storeId), query.status?.length ? inArray(orders.status, query.status) : undefined, query.paymentStatus?.length ? inArray(orders.paymentStatus, query.paymentStatus) : undefined, query.paymentMethod ? eq(orders.paymentMethod, query.paymentMethod) : undefined, query.placedFrom ? gte(orders.placedAt, sqlDate(query.placedFrom)) : undefined, query.placedTo ? lt(orders.placedAt, sqlDate(query.placedTo)) : undefined, term ? or(like(orders.number, term), like(orders.email, term), like(orders.phone, term), contacts) : undefined)
      const order = query.sort === "total_asc" ? [asc(orders.total), desc(orders.placedAt), orders.id] : query.sort === "total_desc" ? [desc(orders.total), desc(orders.placedAt), orders.id] : query.sort === "placed_asc" ? [asc(orders.placedAt), orders.id] : [desc(orders.placedAt), orders.id]
      const [rows, [total]] = await Promise.all([db.select(orderProjection(actor)).from(orders).where(where).orderBy(...order).limit(query.pageSize).offset((query.page - 1) * query.pageSize), db.select({ count: count() }).from(orders).where(where)])
      return { orders: await hydrateOrders(db, rows), total: total.count }
    },
    async listNotes(actor, orderId) {
      requireGrant(actor, "orders:read")
      const db = await database()
      const rows = await db.select(getTableColumns(orderNotes)).from(orderNotes).innerJoin(orders, eq(orders.id, orderNotes.orderId)).where(and(eq(orders.storeId, actor.storeId), eq(orders.id, orderId))).orderBy(asc(orderNotes.createdAt), orderNotes.id)
      return rows.map((row) => ({ ...row, createdAt: isoDate(row.createdAt) }))
    },
    async ledger(actor, storeId, query) {
      requireStore(actor, storeId); requireGrant(actor, "payments:read")
      const db = await database()
      if (query.kind === "payments") {
        const where = and(eq(orders.storeId, actor.storeId), query.provider ? eq(payments.provider, query.provider) : undefined)
        const [rows, [total]] = await Promise.all([
          db.select({ id: payments.id, orderNumber: orders.number, provider: payments.provider, status: payments.status, amount: payments.amount, currency: payments.currency, reference: payments.providerRef, reason: constant(null), at: payments.createdAt }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).where(where).orderBy(desc(payments.createdAt), payments.id).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
          db.select({ count: count() }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).where(where),
        ])
        return { rows: rows.map((row) => ({ ...row, at: isoDate(row.at) })), total: total.count }
      }
      const where = eq(orders.storeId, actor.storeId)
      const [rows, [total]] = await Promise.all([
        db.select({ id: refunds.id, orderNumber: orders.number, provider: payments.provider, status: constant("refunded"), amount: refunds.amount, currency: orders.currency, reference: constant(null), reason: refunds.reason, at: refunds.createdAt }).from(refunds).innerJoin(orders, eq(orders.id, refunds.orderId)).leftJoin(payments, eq(payments.id, refunds.paymentId)).where(where).orderBy(desc(refunds.createdAt), refunds.id).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
        db.select({ count: count() }).from(refunds).innerJoin(orders, eq(orders.id, refunds.orderId)).where(where),
      ])
      return { rows: rows.map((row) => ({ ...row, at: isoDate(row.at) })), total: total.count }
    },
  }
}
