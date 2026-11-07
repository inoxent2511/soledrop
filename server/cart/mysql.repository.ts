import "server-only"

import { and, asc, count, desc, eq, exists, getTableColumns, inArray, isNull, lt } from "drizzle-orm"
import type { CartRepository } from "./repository"
import type { CartRow } from "./types"
import { type Actor, type ActorScoped, requireCustomerOwner, requireGrant, requireStore } from "@/server/db/actor"
import { database, type Database, withTransaction } from "@/server/db/client"
import { constant } from "@/server/db/query.repository"
import { cartLines, cartPromotionCodes, carts, customers, products, variants } from "@/server/db/schema"
import { isoDate, sqlDate, sqlNow } from "@/server/db/values"
import { cartOwnerScope, lockCart, lockLevels, lockStore, releaseCartReservations } from "@/server/inventory/mysql.repository"
import { DomainError } from "@/server/shared/errors"

async function hydrate(db: Database, rows: (typeof carts.$inferSelect)[]): Promise<CartRow[]> {
  if (!rows.length) return []
  const ids = rows.map((row) => row.id)
  const [lines, codes] = await Promise.all([db.select().from(cartLines).where(inArray(cartLines.cartId, ids)).orderBy(asc(cartLines.addedAt), cartLines.id), db.select().from(cartPromotionCodes).where(inArray(cartPromotionCodes.id, ids)).orderBy(asc(cartPromotionCodes.position))])
  return rows.map((row) => ({ ...row, currency: row.currency as CartRow["currency"], status: row.status as CartRow["status"], createdAt: isoDate(row.createdAt), updatedAt: isoDate(row.updatedAt), lines: lines.filter((line) => line.cartId === row.id).map(({ cartId: _cart, ...line }) => ({ ...line, addedAt: isoDate(line.addedAt) })), promotionCodes: codes.filter((code) => code.id === row.id).map((code) => code.value) }))
}

async function writeChildren(db: Database, actor: Actor, cart: CartRow) {
  const ids = [...new Set(cart.lines.map((line) => line.variantId))]
  if (ids.length) {
    const found = await db.select({ id: variants.id }).from(variants).innerJoin(products, eq(products.id, variants.productId)).where(and(eq(products.storeId, actor.storeId), inArray(variants.id, ids)))
    if (found.length !== ids.length) throw new DomainError("not_found", "That product is no longer available.")
  }
  await db.delete(cartLines).where(eq(cartLines.cartId, cart.id))
  if (cart.lines.length) await db.insert(cartLines).values(cart.lines.map((line) => ({ ...line, cartId: cart.id, addedAt: sqlDate(line.addedAt) })))
  await db.delete(cartPromotionCodes).where(eq(cartPromotionCodes.id, cart.id))
  if (cart.promotionCodes.length) await db.insert(cartPromotionCodes).values(cart.promotionCodes.map((value, position) => ({ id: cart.id, value, position })))
}

function assertOwnerAssignment(actor: Actor, customerId: string | null) {
  if (actor.kind === "system" && ["migration", "integration"].includes(actor.purpose)) return
  if (actor.kind === "customer" && (customerId === null || customerId === actor.id)) return
  if (actor.kind === "anonymous" && customerId === null) return
  throw new DomainError("forbidden", "You don't have access to this account.")
}

export function createMysqlCartRepository(): ActorScoped<CartRepository> {
  return {
    async findByTokenHash(actor, storeId, tokenHash) {
      requireStore(actor, storeId)
      const db = await database()
      const rows = await db.select().from(carts).where(and(eq(carts.storeId, actor.storeId), eq(carts.tokenHash, tokenHash), eq(carts.status, "active"), cartOwnerScope(actor))).limit(1)
      return (await hydrate(db, rows))[0] ?? null
    },
    async findById(actor, id) {
      const db = await database()
      return (await hydrate(db, await db.select().from(carts).where(and(eq(carts.storeId, actor.storeId), eq(carts.id, id), cartOwnerScope(actor))).limit(1)))[0] ?? null
    },
    async findActiveByCustomer(actor, storeId, customerId) {
      requireStore(actor, storeId); requireCustomerOwner(actor, customerId)
      const db = await database()
      return (await hydrate(db, await db.select().from(carts).where(and(eq(carts.storeId, actor.storeId), eq(carts.customerId, customerId), eq(carts.status, "active"))).orderBy(desc(carts.updatedAt), carts.id).limit(1)))[0] ?? null
    },
    async create(actor, input) {
      requireStore(actor, input.storeId); assertOwnerAssignment(actor, input.customerId)
      if (actor.kind === "anonymous" && (!actor.cartTokenHash || actor.cartTokenHash !== input.tokenHash) && (input.lines.length || input.status !== "active")) throw new DomainError("forbidden", "A verified cart capability is required.")
      return withTransaction(async (db) => {
        await lockStore(db, actor)
        if (input.customerId) {
          const [owner] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.storeId, actor.storeId), eq(customers.id, input.customerId)))
          if (!owner) throw new DomainError("not_found", "Account not found.")
        }
        const { lines: _lines, promotionCodes: _codes, ...rest } = input
        await db.insert(carts).values({ ...rest, createdAt: sqlDate(input.createdAt), updatedAt: sqlDate(input.updatedAt) })
        await writeChildren(db, actor, input)
        return structuredClone(input)
      })
    },
    async save(actor, input) {
      requireStore(actor, input.storeId); assertOwnerAssignment(actor, input.customerId)
      return withTransaction(async (db) => {
        await lockStore(db, actor)
        const row = await lockCart(db, actor, input.id)
        if (row.tokenHash !== input.tokenHash || row.status !== "active" || input.status !== "active") throw new DomainError("conflict", "Your bag has expired.")
        // Replacing an old cart snapshot must not overwrite another concurrent mutation.
        if (isoDate(row.updatedAt) !== input.updatedAt) throw new DomainError("conflict", "Your bag changed. Please try again.")
        const updatedAt = sqlDate(new Date(Math.max(Date.now(), Date.parse(isoDate(row.updatedAt)) + 1)).toISOString())
        await db.update(carts).set({ customerId: input.customerId, currency: input.currency, updatedAt }).where(and(eq(carts.id, row.id), eq(carts.storeId, actor.storeId)))
        await writeChildren(db, actor, input)
        return { ...structuredClone(input), updatedAt: isoDate(updatedAt) }
      })
    },
    async merge(actor, guestCartId, customerCartId) {
      if (actor.kind !== "customer" && !(actor.kind === "system" && ["migration", "integration"].includes(actor.purpose))) throw new DomainError("forbidden", "Sign in to merge your bag.")
      return withTransaction(async (db) => {
        await lockStore(db, actor)
        const rows = await db.select().from(carts).where(and(eq(carts.storeId, actor.storeId), inArray(carts.id, [guestCartId, customerCartId]), cartOwnerScope(actor))).orderBy(asc(carts.id)).for("update")
        const hydrated = await hydrate(db, rows)
        const guest = hydrated.find((cart) => cart.id === guestCartId), target = hydrated.find((cart) => cart.id === customerCartId)
        if (!guest || !target || guest.id === target.id || guest.customerId !== null || actor.kind === "customer" && target.customerId !== actor.id) throw new DomainError("not_found", "Cart not found.")
        if (guest.status === "merged") return target
        if (guest.status !== "active" || target.status !== "active") throw new DomainError("conflict", "Your bag has expired.")
        const levels = await lockLevels(db, actor, guest.lines.map((line) => line.variantId))
        for (const line of guest.lines) {
          const existing = target.lines.find((item) => item.variantId === line.variantId)
          const cap = Math.min(10, levels.find((level) => level.variantId === line.variantId)?.onHand ?? 0)
          if (existing) existing.quantity = Math.min(cap, existing.quantity + line.quantity)
          else if (cap > 0) target.lines.push({ ...line, quantity: Math.min(cap, line.quantity) })
        }
        target.lines = target.lines.filter((line) => line.quantity > 0)
        target.promotionCodes = [...new Set([...target.promotionCodes, ...guest.promotionCodes])]
        target.updatedAt = isoDate(sqlNow())
        await releaseCartReservations(db, actor, guest.id)
        await db.delete(cartLines).where(eq(cartLines.cartId, guest.id))
        await db.update(carts).set({ status: "merged", updatedAt: sqlNow() }).where(and(eq(carts.storeId, actor.storeId), eq(carts.id, guest.id)))
        await writeChildren(db, actor, target)
        await db.update(carts).set({ updatedAt: sqlDate(target.updatedAt) }).where(and(eq(carts.storeId, actor.storeId), eq(carts.id, target.id)))
        return target
      })
    },
    async purgeAbandoned(actor, olderThanDays) {
      if (actor.kind !== "system" || !["jobs", "migration"].includes(actor.purpose)) requireGrant(actor, "jobs:run")
      return withTransaction(async (db) => {
        await lockStore(db, actor)
        const rows = await db.select({ id: carts.id }).from(carts).where(and(eq(carts.storeId, actor.storeId), isNull(carts.customerId), lt(carts.updatedAt, sqlDate(new Date(Date.now() - olderThanDays * 86_400_000).toISOString())))).orderBy(asc(carts.id)).limit(200).for("update")
        for (const row of rows) { await releaseCartReservations(db, actor, row.id); await db.delete(carts).where(and(eq(carts.storeId, actor.storeId), eq(carts.id, row.id))) }
        return rows.length
      })
    },
    async listAbandoned(actor, storeId, query) {
      requireStore(actor, storeId); requireGrant(actor, "marketing:read")
      const db = await database()
      const where = and(eq(carts.storeId, actor.storeId), eq(carts.status, "active"), lt(carts.updatedAt, sqlDate(new Date(Date.now() - query.olderThanHours * 3_600_000).toISOString())), exists(db.select({ id: cartLines.id }).from(cartLines).where(eq(cartLines.cartId, carts.id))))
      const [rows, [total]] = await Promise.all([db.select({ ...getTableColumns(carts), tokenHash: constant("") }).from(carts).where(where).orderBy(desc(carts.updatedAt), carts.id).limit(query.pageSize).offset((query.page - 1) * query.pageSize), db.select({ count: count() }).from(carts).where(where)])
      return { carts: await hydrate(db, rows), total: total.count }
    },
  }
}
