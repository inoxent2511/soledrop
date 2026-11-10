import "server-only"
import { mysqlPolicy } from "@/server/db/policy.repository"

import { and, asc, desc, eq, getTableColumns, inArray, isNull, lte, or } from "drizzle-orm"
import type { InventoryOperations, StockRequest } from "./repository"
import { type Actor, type ActorScoped, requireGrant } from "@/server/db/actor"
import { database, type Database, withTransaction } from "@/server/db/client"
import { auditLog, carts, inventoryLevels, inventoryMovements, inventoryReservations, products, stores, variants } from "@/server/db/schema"
import { isoDate, sqlDate, sqlNow } from "@/server/db/values"
import { uuidv7 } from "@/server/db/uuid"
import { DomainError } from "@/server/shared/errors"
import { stockPage } from "./stock-page.repository"

export async function lockStore(db: Database, actor: Actor) {
  const [row] = await db.select({ id: stores.id }).from(stores).where(eq(stores.id, actor.storeId)).for("update")
  if (!row) throw new DomainError("not_found", "Store not found.")
}

export function cartOwnerScope(actor: Actor) {
  if (actor.kind === "system" && ["migration", "jobs", "integration"].includes(actor.purpose)) return undefined
  if (actor.kind === "staff") { requireGrant(actor, "orders:write"); return undefined }
  if (actor.kind === "customer") return or(eq(carts.customerId, actor.id), actor.cartTokenHash ? and(isNull(carts.customerId), eq(carts.tokenHash, actor.cartTokenHash)) : undefined)
  if (actor.kind === "anonymous" && actor.cartTokenHash) return and(isNull(carts.customerId), eq(carts.tokenHash, actor.cartTokenHash))
  throw new DomainError("forbidden", "You don't have access to this cart.")
}

export async function lockCart(db: Database, actor: Actor, cartId: string) {
  const [row] = await db.select().from(carts).where(and(eq(carts.storeId, actor.storeId), eq(carts.id, cartId), cartOwnerScope(actor))).for("update")
  if (!row) throw new DomainError("not_found", "Cart not found.")
  return row
}

export async function lockLevels(db: Database, actor: Actor, ids: string[]) {
  if (!ids.length) return []
  return db.select(getTableColumns(inventoryLevels)).from(inventoryLevels).innerJoin(variants, eq(variants.id, inventoryLevels.variantId)).innerJoin(products, eq(products.id, variants.productId)).where(and(eq(products.storeId, actor.storeId), inArray(inventoryLevels.variantId, [...new Set(ids)].sort()))).orderBy(asc(inventoryLevels.variantId)).for("update")
}

/** Store lock precedes all reservation/inventory locks, shared with checkout and admin writes. */
export async function releaseReservations(db: Database, actor: Actor, rows: (typeof inventoryReservations.$inferSelect)[]) {
  if (!rows.length) return
  const levels = await lockLevels(db, actor, rows.map((row) => row.variantId))
  for (const level of levels) {
    const quantity = rows.filter((row) => row.variantId === level.variantId).reduce((sum, row) => sum + row.quantity, 0)
    if (quantity > level.reserved) throw new DomainError("conflict", "Stock reservation accounting needs attention.")
    await db.update(inventoryLevels).set({ reserved: level.reserved - quantity }).where(eq(inventoryLevels.variantId, level.variantId))
  }
  for (let start = 0; start < rows.length; start += 1000) await db.delete(inventoryReservations).where(inArray(inventoryReservations.id, rows.slice(start, start + 1000).map((row) => row.id)))
}

export async function releaseCartReservations(db: Database, actor: Actor, cartId: string) {
  const rows = await db.select(getTableColumns(inventoryReservations)).from(inventoryReservations).innerJoin(carts, eq(carts.id, inventoryReservations.cartId)).where(and(eq(carts.storeId, actor.storeId), eq(inventoryReservations.cartId, cartId))).orderBy(inventoryReservations.variantId, inventoryReservations.id).for("update")
  await releaseReservations(db, actor, rows)
}

export async function releaseExpiredReservations(db: Database, actor: Actor, limit = 500, requestedVariants?: string[]) {
  if (requestedVariants && !requestedVariants.length) return 0
  const selection = db.select(getTableColumns(inventoryReservations)).from(inventoryReservations).innerJoin(carts, eq(carts.id, inventoryReservations.cartId)).where(and(eq(carts.storeId, actor.storeId), lte(inventoryReservations.expiresAt, sqlNow()), requestedVariants ? inArray(inventoryReservations.variantId, requestedVariants) : undefined)).orderBy(inventoryReservations.variantId, inventoryReservations.id).$dynamic()
  // Scheduled sweeps are bounded; checkout must release every expired hold on the sizes it buys.
  const rows = await (requestedVariants ? selection.for("update") : selection.limit(limit).for("update"))
  await releaseReservations(db, actor, rows)
  return rows.length
}

function stockItems(items: StockRequest[]): StockRequest[] {
  const summed = new Map<string, number>()
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new DomainError("validation", "Invalid stock quantity.")
    summed.set(item.variantId, (summed.get(item.variantId) ?? 0) + item.quantity)
  }
  return [...summed].sort(([a], [b]) => a.localeCompare(b)).map(([variantId, quantity]) => ({ variantId, quantity }))
}

export function createMysqlInventoryRepository(): ActorScoped<InventoryOperations> {
  return mysqlPolicy<InventoryOperations>({
    search: stockPage,
    async availability(actor, variantIds, forCartId) {
      if (!variantIds.length) return new Map()
      const db = await database()
      const levels = await db.select(getTableColumns(inventoryLevels)).from(inventoryLevels).innerJoin(variants, eq(variants.id, inventoryLevels.variantId)).innerJoin(products, eq(products.id, variants.productId)).where(and(eq(products.storeId, actor.storeId), eq(products.status, "active"), inArray(inventoryLevels.variantId, variantIds)))
      const own = forCartId ? await db.select({ variantId: inventoryReservations.variantId, quantity: inventoryReservations.quantity }).from(inventoryReservations).innerJoin(carts, eq(carts.id, inventoryReservations.cartId)).where(and(eq(carts.storeId, actor.storeId), eq(carts.id, forCartId), cartOwnerScope(actor), inArray(inventoryReservations.variantId, variantIds))) : []
      return new Map(variantIds.map((id) => { const row = levels.find((level) => level.variantId === id); return [id, row ? row.onHand - row.reserved + own.filter((hold) => hold.variantId === id).reduce((sum, hold) => sum + hold.quantity, 0) : 0] }))
    },
    async reserve(actor, cartId, requested, ttlMinutes) {
      if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0 || ttlMinutes > 1440) throw new DomainError("validation", "Invalid reservation duration.")
      const items = stockItems(requested)
      await withTransaction(async (db) => {
        await lockStore(db, actor)
        const cart = await lockCart(db, actor, cartId)
        if (cart.status !== "active") throw new DomainError("conflict", "This cart is no longer active.")
        await releaseExpiredReservations(db, actor, 500, items.map((item) => item.variantId))
        await releaseCartReservations(db, actor, cartId)
        const levels = await lockLevels(db, actor, items.map((item) => item.variantId))
        const expiresAt = sqlDate(new Date(Date.now() + ttlMinutes * 60_000).toISOString())
        for (const item of items) {
          const row = levels.find((level) => level.variantId === item.variantId)
          if (!row || row.onHand - row.reserved < item.quantity) throw new DomainError("out_of_stock", "Some items are no longer available in that quantity.", { variantId: item.variantId })
          await db.update(inventoryLevels).set({ reserved: row.reserved + item.quantity }).where(eq(inventoryLevels.variantId, row.variantId))
          await db.insert(inventoryReservations).values({ id: uuidv7(), cartId, ...item, expiresAt })
        }
      })
    },
    async release(actor, cartId) {
      await withTransaction(async (db) => { await lockStore(db, actor); await lockCart(db, actor, cartId); await releaseCartReservations(db, actor, cartId) })
    },
    async releaseExpired(actor) {
      if (actor.kind !== "system" || !["jobs", "migration"].includes(actor.purpose)) requireGrant(actor, "jobs:run")
      return withTransaction(async (db) => { await lockStore(db, actor); return releaseExpiredReservations(db, actor) })
    },
    async onHand(actor, variantIds) {
      requireGrant(actor, "inventory:read")
      if (!variantIds.length) return new Map()
      const db = await database()
      const rows = await db.select({ variantId: inventoryLevels.variantId, onHand: inventoryLevels.onHand }).from(inventoryLevels).innerJoin(variants, eq(variants.id, inventoryLevels.variantId)).innerJoin(products, eq(products.id, variants.productId)).where(and(eq(products.storeId, actor.storeId), inArray(inventoryLevels.variantId, variantIds)))
      return new Map(variantIds.map((id) => [id, rows.find((row) => row.variantId === id)?.onHand ?? 0]))
    },
    async adjust(actor, variantId, delta, reason, actorLabel) {
      requireGrant(actor, "inventory:adjust")
      if (actor.kind === "staff" && actorLabel !== actor.id && actorLabel !== "staff:" + actor.id) throw new DomainError("forbidden", "Adjustment identity does not match the actor.")
      if (!Number.isSafeInteger(delta)) throw new DomainError("validation", "Invalid stock adjustment.")
      return withTransaction(async (db) => {
        await lockStore(db, actor)
        const [row] = await lockLevels(db, actor, [variantId])
        if (!row) throw new DomainError("not_found", "Unknown variant.")
        const onHand = row.onHand + delta
        if (onHand < 0 || onHand < row.reserved) throw new DomainError("out_of_stock", "Some items are no longer available in that quantity.", { variantId })
        await db.update(inventoryLevels).set({ onHand }).where(eq(inventoryLevels.variantId, row.variantId))
        await db.insert(inventoryMovements).values({ id: uuidv7(), variantId, delta, reason, actor: actorLabel })
        await db.insert(auditLog).values({ id: uuidv7(), storeId: actor.storeId, actor: actorLabel, action: "inventory.adjust", entity: "variant", entityId: variantId, before: { onHand: row.onHand }, after: { onHand, reason } })
        return onHand
      })
    },
    async reportLevels(actor, variantIds) {
      requireGrant(actor, "reports:read")
      if (!variantIds.length) return []
      const db = await database()
      return db.select({ variantId: inventoryLevels.variantId, onHand: inventoryLevels.onHand, reserved: inventoryLevels.reserved }).from(inventoryLevels).innerJoin(variants, eq(variants.id, inventoryLevels.variantId)).innerJoin(products, eq(products.id, variants.productId)).where(and(eq(products.storeId, actor.storeId), inArray(inventoryLevels.variantId, variantIds)))
    },
    async levels(actor, variantIds) {
      requireGrant(actor, "inventory:read")
      if (!variantIds.length) return []
      const db = await database()
      return db.select({ variantId: inventoryLevels.variantId, onHand: inventoryLevels.onHand, reserved: inventoryLevels.reserved }).from(inventoryLevels).innerJoin(variants, eq(variants.id, inventoryLevels.variantId)).innerJoin(products, eq(products.id, variants.productId)).where(and(eq(products.storeId, actor.storeId), inArray(inventoryLevels.variantId, variantIds)))
    },
    async catalogueLevels(actor, variantIds) {
      requireGrant(actor, "products:read")
      if (!variantIds.length) return []
      const db = await database()
      return db.select({ variantId: inventoryLevels.variantId, onHand: inventoryLevels.onHand, reserved: inventoryLevels.reserved }).from(inventoryLevels).innerJoin(variants, eq(variants.id, inventoryLevels.variantId)).innerJoin(products, eq(products.id, variants.productId)).where(and(eq(products.storeId, actor.storeId), inArray(inventoryLevels.variantId, variantIds)))
    },
    async movements(actor, variantIds, limit) {
      requireGrant(actor, "inventory:read")
      if (!variantIds.length) return []
      const db = await database()
      const rows = await db.select(getTableColumns(inventoryMovements)).from(inventoryMovements).innerJoin(variants, eq(variants.id, inventoryMovements.variantId)).innerJoin(products, eq(products.id, variants.productId)).where(and(eq(products.storeId, actor.storeId), inArray(inventoryMovements.variantId, variantIds))).orderBy(desc(inventoryMovements.at)).limit(Math.min(1000, limit))
      return rows.map((row) => ({ ...row, at: isoDate(row.at) }))
    },
  })
}
