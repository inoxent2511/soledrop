import "server-only"

import type { CartRepository } from "@/server/cart/repository"
import type { CartRow } from "@/server/cart/types"
import { db, transaction } from "@/server/fixtures/store"
import { releaseCartIn } from "@/server/inventory/fixtures.repository"
import { DomainError } from "@/server/shared/errors"
import { now } from "@/server/shared/ids"

export const MAX_LINE_QUANTITY = 10

export function createFixturesCartRepository(): CartRepository {
  return {
    async findByTokenHash(storeId, tokenHash) {
      return structuredClone(db().carts.find((cart) => cart.storeId === storeId && cart.tokenHash === tokenHash && cart.status === "active") ?? null)
    },
    async findById(id) {
      return structuredClone(db().carts.find((cart) => cart.id === id) ?? null)
    },
    async findActiveByCustomer(storeId, customerId) {
      const carts = db().carts.filter((cart) => cart.storeId === storeId && cart.customerId === customerId && cart.status === "active")
      return structuredClone(carts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null)
    },
    async create(cart) {
      db().carts.push(structuredClone(cart))
      return cart
    },
    async save(cart) {
      return transaction((tables) => {
        const index = tables.carts.findIndex((row) => row.id === cart.id)
        if (index === -1) throw new DomainError("not_found", "Your bag has expired.")
        const updated: CartRow = { ...structuredClone(cart), updatedAt: now() }
        tables.carts[index] = updated
        return structuredClone(updated)
      })
    },
    async merge(guestCartId, customerCartId) {
      return transaction((tables) => {
        const guest = tables.carts.find((cart) => cart.id === guestCartId)
        const target = tables.carts.find((cart) => cart.id === customerCartId)
        if (!guest || !target) throw new DomainError("not_found", "Cart not found.")
        for (const line of guest.lines) {
          const existing = target.lines.find((row) => row.variantId === line.variantId)
          const level = tables.inventory.find((row) => row.variantId === line.variantId)
          const cap = Math.min(MAX_LINE_QUANTITY, level ? level.onHand : 0)
          if (existing) existing.quantity = Math.min(cap, existing.quantity + line.quantity)
          else if (cap > 0) target.lines.push({ ...line, quantity: Math.min(cap, line.quantity) })
        }
        target.lines = target.lines.filter((line) => line.quantity > 0)
        target.promotionCodes = [...new Set([...target.promotionCodes, ...guest.promotionCodes])]
        target.updatedAt = now()
        guest.status = "merged"
        guest.lines = []
        releaseCartIn(tables, guest.id)
        return structuredClone(target)
      })
    },
    async purgeAbandoned(olderThanDays) {
      return transaction((tables) => {
        const cutoff = Date.now() - olderThanDays * 86_400_000
        const stale = tables.carts.filter((cart) => cart.customerId === null && Date.parse(cart.updatedAt) < cutoff)
        for (const cart of stale) releaseCartIn(tables, cart.id)
        tables.carts = tables.carts.filter((cart) => !stale.includes(cart))
        return stale.length
      })
    },
    async listAbandoned(storeId, query) {
      const cutoff = new Date(Date.now() - query.olderThanHours * 3_600_000).toISOString()
      const found = db()
        .carts.filter((cart) => cart.storeId === storeId && cart.status === "active" && cart.lines.length > 0 && cart.updatedAt < cutoff)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      const start = (query.page - 1) * query.pageSize
      return { carts: structuredClone(found.slice(start, start + query.pageSize)), total: found.length }
    },
  }
}
