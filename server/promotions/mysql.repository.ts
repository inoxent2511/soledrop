import "server-only"
import { mysqlPolicy } from "@/server/db/policy.repository"

import { and, count, desc, eq, ne, or } from "drizzle-orm"
import type { PromotionOperations } from "./repository"
import type { Promotion } from "./types"
import { type Actor, type ActorScoped, requireGrant, requireStore } from "@/server/db/actor"
import { database, withTransaction } from "@/server/db/client"
import { constant } from "@/server/db/query.repository"
import { orders, promotionRedemptions, promotions } from "@/server/db/schema"
import { isoDate, jsonValue, nullableIsoDate, nullableSqlDate } from "@/server/db/values"
import { DomainError } from "@/server/shared/errors"

function promotion(row: typeof promotions.$inferSelect): Promotion {
  return { ...row, active: row.active === 1, combinable: row.combinable === 1, conditions: jsonValue<Promotion["conditions"]>(row.conditions), actions: jsonValue<Promotion["actions"]>(row.actions), startsAt: nullableIsoDate(row.startsAt), endsAt: nullableIsoDate(row.endsAt) }
}

function assertShopper(actor: Actor, shopper: { customerId: string | null; email: string | null }) {
  if (actor.kind === "system" && ["migration", "integration"].includes(actor.purpose)) return
  if (actor.kind === "customer" && shopper.customerId === actor.id && (!shopper.email || shopper.email.toLowerCase() === actor.email)) return
  if (actor.kind === "anonymous" && shopper.customerId === null && (!shopper.email || shopper.email.toLowerCase() === actor.checkoutEmail)) return
  throw new DomainError("forbidden", "You don't have access to this shopper.")
}

export function createMysqlPromotionRepository(): ActorScoped<PromotionOperations> {
  return mysqlPolicy<PromotionOperations>({
    async listActive(actor, storeId) {
      requireStore(actor, storeId)
      const db = await database()
      return (await db.select().from(promotions).where(and(eq(promotions.storeId, actor.storeId), eq(promotions.active, 1)))).map(promotion)
    },
    async redemptionsFor(actor, storeId, shopper) {
      requireStore(actor, storeId); assertShopper(actor, shopper)
      if (!shopper.customerId && !shopper.email) return new Map()
      const db = await database()
      const owner = or(shopper.customerId ? eq(promotionRedemptions.customerId, shopper.customerId) : undefined, shopper.email ? eq(promotionRedemptions.email, shopper.email.toLowerCase()) : undefined)
      const rows = await db.select({ id: promotionRedemptions.promotionId, count: count() }).from(promotionRedemptions).innerJoin(promotions, eq(promotions.id, promotionRedemptions.promotionId)).where(and(eq(promotions.storeId, actor.storeId), owner)).groupBy(promotionRedemptions.promotionId)
      return new Map(rows.map((row) => [row.id, row.count]))
    },
    async orderCountFor(actor, storeId, shopper) {
      requireStore(actor, storeId); assertShopper(actor, shopper)
      if (!shopper.customerId && !shopper.email) return 0
      const db = await database()
      const owner = or(shopper.customerId ? eq(orders.customerId, shopper.customerId) : undefined, shopper.email ? eq(orders.email, shopper.email.toLowerCase()) : undefined)
      const [row] = await db.select({ count: count() }).from(orders).where(and(eq(orders.storeId, actor.storeId), ne(orders.status, "cancelled"), owner))
      return row.count
    },
    async listAll(actor, storeId) {
      requireStore(actor, storeId); requireGrant(actor, "promotions:read")
      const db = await database()
      return (await db.select().from(promotions).where(eq(promotions.storeId, actor.storeId))).map(promotion)
    },
    async find(actor, storeId, id) {
      requireStore(actor, storeId); requireGrant(actor, "promotions:read")
      const db = await database()
      const [row] = await db.select().from(promotions).where(and(eq(promotions.storeId, actor.storeId), eq(promotions.id, id))).limit(1)
      return row ? promotion(row) : null
    },
    async save(actor, input) {
      requireStore(actor, input.storeId); requireGrant(actor, "promotions:write")
      return withTransaction(async (db) => {
        const where = and(eq(promotions.id, input.id), eq(promotions.storeId, actor.storeId))
        const [existing] = await db.select().from(promotions).where(where).for("update")
        const { timesUsed: _counter, id, storeId, ...rest } = input
        const changes = { ...rest, code: input.code?.trim().toUpperCase() ?? null, startsAt: nullableSqlDate(input.startsAt), endsAt: nullableSqlDate(input.endsAt), active: input.active ? 1 : 0, combinable: input.combinable ? 1 : 0 }
        if (existing) await db.update(promotions).set(changes).where(where)
        else await db.insert(promotions).values({ id, storeId, ...changes })
        const [saved] = await db.select().from(promotions).where(and(eq(promotions.id, id), eq(promotions.storeId, actor.storeId)))
        return promotion(saved)
      })
    },
    async remove(actor, storeId, id) {
      requireStore(actor, storeId); requireGrant(actor, "promotions:write")
      await withTransaction(async (db) => {
        const [row] = await db.select().from(promotions).where(and(eq(promotions.storeId, actor.storeId), eq(promotions.id, id))).for("update")
        if (!row) throw new DomainError("not_found", "Promotion not found.")
        const [used] = await db.select({ id: promotionRedemptions.id }).from(promotionRedemptions).where(eq(promotionRedemptions.promotionId, id)).limit(1)
        if (used || row.timesUsed > 0) throw new DomainError("conflict", "This promotion has been used. Switch it off instead.")
        await db.delete(promotions).where(and(eq(promotions.storeId, actor.storeId), eq(promotions.id, id)))
      })
    },
    async redemptions(actor, promotionId, limit) {
      requireGrant(actor, "promotions:read")
      const db = await database()
      const rows = await db.select({ promotionId: promotionRedemptions.promotionId, orderId: promotionRedemptions.orderId, email: actor.permissions.includes("customers:read_pii") ? promotionRedemptions.email : constant("***"), at: promotionRedemptions.at }).from(promotionRedemptions).innerJoin(promotions, eq(promotions.id, promotionRedemptions.promotionId)).where(and(eq(promotions.storeId, actor.storeId), eq(promotions.id, promotionId))).orderBy(desc(promotionRedemptions.at)).limit(Math.min(1000, limit))
      return rows.map((row) => ({ ...row, at: isoDate(row.at) }))
    },
  })
}
