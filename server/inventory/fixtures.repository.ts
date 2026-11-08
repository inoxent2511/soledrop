import "server-only"

import { db, transaction } from "@/server/fixtures/store"
import type { FixtureTables } from "@/server/fixtures/tables"
import type { InventoryOperations } from "@/server/inventory/repository"
import { DomainError } from "@/server/shared/errors"
import { newId, now } from "@/server/shared/ids"

/** Drops expired reservations and gives their quantity back. Called inside a transaction. */
export function releaseExpiredIn(tables: FixtureTables, at = Date.now()): number {
  const expired = tables.reservations.filter((reservation) => Date.parse(reservation.expiresAt) <= at)
  for (const reservation of expired) {
    const level = tables.inventory.find((row) => row.variantId === reservation.variantId)
    if (level) level.reserved -= reservation.quantity
  }
  tables.reservations = tables.reservations.filter((reservation) => !expired.includes(reservation))
  return expired.length
}

/** Releases one cart's reservations. Called inside a transaction. */
export function releaseCartIn(tables: FixtureTables, cartId: string): void {
  for (const reservation of tables.reservations.filter((row) => row.cartId === cartId)) {
    const level = tables.inventory.find((row) => row.variantId === reservation.variantId)
    if (level) level.reserved -= reservation.quantity
  }
  tables.reservations = tables.reservations.filter((row) => row.cartId !== cartId)
}

/** Mirrors the inventory_levels CHECK constraints: on_hand ≥ 0, 0 ≤ reserved ≤ on_hand. */
export function assertInventoryInvariants(tables: FixtureTables): void {
  for (const level of tables.inventory) {
    if (level.onHand < 0 || level.reserved < 0 || level.reserved > level.onHand) {
      throw new DomainError("out_of_stock", "Some items are no longer available in that quantity.", { variantId: level.variantId })
    }
  }
}

export function createFixturesInventoryRepository(): InventoryOperations {
  return {
    async availability(variantIds, forCartId) {
      const tables = db()
      const result = new Map<string, number>()
      for (const variantId of variantIds) {
        const level = tables.inventory.find((row) => row.variantId === variantId)
        const own = forCartId
          ? tables.reservations.filter((row) => row.cartId === forCartId && row.variantId === variantId).reduce((total, row) => total + row.quantity, 0)
          : 0
        result.set(variantId, level ? level.onHand - level.reserved + own : 0)
      }
      return result
    },
    async reserve(cartId, items, ttlMinutes) {
      transaction((tables) => {
        releaseExpiredIn(tables)
        releaseCartIn(tables, cartId)
        const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString()
        for (const item of items) {
          const level = tables.inventory.find((row) => row.variantId === item.variantId)
          if (!level || level.onHand - level.reserved < item.quantity) {
            throw new DomainError("out_of_stock", "Some items are no longer available in that quantity.", { variantId: item.variantId })
          }
          level.reserved += item.quantity
          tables.reservations.push({ id: newId(), cartId, variantId: item.variantId, quantity: item.quantity, expiresAt })
        }
        assertInventoryInvariants(tables)
      })
    },
    async release(cartId) {
      transaction((tables) => releaseCartIn(tables, cartId))
    },
    async releaseExpired() {
      return transaction((tables) => releaseExpiredIn(tables))
    },
    async onHand(variantIds) {
      const levels = db().inventory
      return new Map(variantIds.map((variantId) => [variantId, levels.find((row) => row.variantId === variantId)?.onHand ?? 0]))
    },
    async adjust(variantId, delta, reason, actor) {
      return transaction((tables) => {
        const level = tables.inventory.find((row) => row.variantId === variantId)
        if (!level) throw new DomainError("not_found", "Unknown variant.")
        const before = level.onHand
        level.onHand += delta
        assertInventoryInvariants(tables)
        tables.inventoryMovements.push({ id: newId(), variantId, delta, reason, actor, at: now() })
        tables.audit.push({ id: newId(), actor, action: "inventory.adjust", entity: "variant", entityId: variantId, before: { onHand: before }, after: { onHand: level.onHand, reason }, at: now() })
        return level.onHand
      })
    },
    async levels(variantIds) {
      const wanted = new Set(variantIds)
      return structuredClone(db().inventory.filter((row) => wanted.has(row.variantId)))
    },
    async movements(variantIds, limit) {
      const wanted = new Set(variantIds)
      return structuredClone(db().inventoryMovements.filter((row) => wanted.has(row.variantId)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit))
    },
  }
}
