import "server-only"
import { mysqlPolicy } from "@/server/db/policy.repository"

import { createHash } from "node:crypto"
import { and, asc, count, desc, eq, getTableColumns, gte, like, lt, lte, sql } from "drizzle-orm"
import type { PlatformOperations } from "./repository"
import type { AuditEntry, EventTopic, FeatureFlag, OutboxEvent, WebhookDelivery } from "./types"
import type { Permission } from "@/server/admin/permissions"
import { type Actor, type ActorScoped, requireGrant, requireStore } from "@/server/db/actor"
import { database, withTransaction } from "@/server/db/client"
import { constant } from "@/server/db/query.repository"
import { auditLog, featureFlagCustomerGroups, featureFlags, idempotencyKeys, outboxEvents, rateLimits, webhookDeliveries } from "@/server/db/schema"
import { escapeLike, isoDate, jsonValue, sqlDate, sqlNow } from "@/server/db/values"
import { uuidv7 } from "@/server/db/uuid"
import { DomainError } from "@/server/shared/errors"
import { serverEnv } from "@/lib/env.server"
import { sealDeliveryPayload } from "@/server/platform/private-payload"

function job(actor: Actor) { if (actor.kind !== "system" || !["jobs", "migration"].includes(actor.purpose)) requireGrant(actor, "jobs:run") }
function scopedKey(actor: Actor, key: string, identity = false) {
  const owner = actor.kind === "anonymous" ? actor.cartTokenHash ?? actor.orderAccessTokenHash : actor.id
  if (identity && !owner) throw new DomainError("forbidden", "A session or cart capability is required.")
  return createHash("sha256").update(actor.storeId + ":" + (identity ? actor.kind + ":" + owner + ":" : "") + key).digest("hex")
}
function event(row: typeof outboxEvents.$inferSelect): OutboxEvent { return { id: row.id, topic: row.topic as EventTopic, payload: jsonValue<OutboxEvent["payload"]>(row.payload), status: row.status as OutboxEvent["status"], attempts: row.attempts, availableAt: isoDate(row.availableAt), createdAt: isoDate(row.createdAt), lastError: row.lastError } }
function audit(row: typeof auditLog.$inferSelect): AuditEntry { return { ...row, at: isoDate(row.at) } }
function delivery(row: typeof webhookDeliveries.$inferSelect): WebhookDelivery { return { ...row, status: row.status as WebhookDelivery["status"], at: isoDate(row.at) } }

export function createMysqlPlatformRepository(): ActorScoped<PlatformOperations> {
  return mysqlPolicy<PlatformOperations>({
    async listFlags(actor, storeId) {
      requireStore(actor, storeId)
      const db = await database()
      const rows = await db.select().from(featureFlags).where(eq(featureFlags.storeId, actor.storeId))
      const groups = await db.select().from(featureFlagCustomerGroups).where(eq(featureFlagCustomerGroups.storeId, actor.storeId)).orderBy(featureFlagCustomerGroups.position)
      return rows.map((row): FeatureFlag => { const values = groups.filter((group) => group.key === row.key).map((group) => group.value); return { key: row.key, description: row.description, enabled: row.enabled === 1, ...(row.groupsRestricted ? { customerGroups: values } : {}) } })
    },
    async enqueue(actor, storeId, topic, payload) {
      requireStore(actor, storeId)
      if (actor.kind === "anonymous" && !["contact.received", "newsletter.subscribed"].includes(topic) && !actor.cartTokenHash) throw new DomainError("forbidden", "A verified capability is required.")
      const db = await database()
      payload = sealDeliveryPayload(payload, serverEnv.SESSION_SECRET)
      const id = uuidv7(), at = sqlNow()
      await db.insert(outboxEvents).values({ id, storeId, topic, payload, availableAt: at, createdAt: at })
      return { id, topic, payload: structuredClone(payload), status: "pending", attempts: 0, availableAt: isoDate(at), createdAt: isoDate(at), lastError: null }
    },
    async claimDue(actor, limit) {
      job(actor)
      return withTransaction(async (db) => {
        const rows = await db.select().from(outboxEvents).where(and(eq(outboxEvents.storeId, actor.storeId), eq(outboxEvents.status, "pending"), lte(outboxEvents.availableAt, sqlNow()))).orderBy(asc(outboxEvents.availableAt), outboxEvents.id).limit(Math.min(100, limit)).for("update", { skipLocked: true })
        const availableAt = sqlDate(new Date(Date.now() + 60_000).toISOString())
        for (const row of rows) await db.update(outboxEvents).set({ attempts: row.attempts + 1, availableAt }).where(and(eq(outboxEvents.storeId, actor.storeId), eq(outboxEvents.id, row.id)))
        return rows.map((row) => event({ ...row, attempts: row.attempts + 1, availableAt }))
      })
    },
    async markDelivered(actor, id) {
      job(actor)
      const db = await database()
      await db.update(outboxEvents).set({ status: "delivered", deliveredAt: sqlNow() }).where(and(eq(outboxEvents.storeId, actor.storeId), eq(outboxEvents.id, id)))
    },
    async markFailed(actor, id, error, maxAttempts) {
      job(actor)
      await withTransaction(async (db) => {
        const where = and(eq(outboxEvents.storeId, actor.storeId), eq(outboxEvents.id, id))
        const [row] = await db.select().from(outboxEvents).where(where).for("update")
        if (!row || row.status === "delivered") return
        await db.update(outboxEvents).set({ lastError: error.slice(0, 2000), status: row.attempts >= maxAttempts ? "failed" : "pending", availableAt: sqlDate(new Date(Date.now() + 2 ** Math.min(16, row.attempts) * 30_000).toISOString()) }).where(where)
      })
    },
    async recordDelivery(actor, input) {
      job(actor)
      await withTransaction(async (db) => {
        const [owner] = await db.select({ id: outboxEvents.id }).from(outboxEvents).where(and(eq(outboxEvents.storeId, actor.storeId), eq(outboxEvents.id, input.eventId))).for("update")
        if (!owner) throw new DomainError("not_found", "Event not found.")
        await db.insert(webhookDeliveries).values({ ...input, at: sqlDate(input.at) })
      })
    },
    async audit(actor, input) {
      if (input.storeId !== undefined && input.storeId !== null) requireStore(actor, input.storeId)
      if (actor.kind !== "system" && (actor.kind !== "staff" || input.actor !== actor.id)) throw new DomainError("forbidden", "Audit identity does not match the actor.")
      const db = await database()
      await db.insert(auditLog).values({ ...input, id: uuidv7(), storeId: actor.storeId, at: sqlNow(), actorRole: input.actorRole ?? null, ip: input.ip ?? null, userAgent: input.userAgent ?? null, requestId: input.requestId ?? null, reason: input.reason ?? null })
    },
    async listAudit(actor, entity, entityId) {
      const grant: Record<string, Permission> = { order: "orders:read", product: "products:read", customer: "customers:read", promotion: "promotions:read" }
      requireGrant(actor, actor.permissions.includes("audit:read") ? "audit:read" : grant[entity] ?? "audit:read")
      const db = await database()
      const pii = actor.permissions.includes("customers:read_pii")
      const rows = await db.select({ ...getTableColumns(auditLog), before: pii ? auditLog.before : constant(null), after: pii ? auditLog.after : constant(null) }).from(auditLog).where(and(eq(auditLog.storeId, actor.storeId), eq(auditLog.entity, entity), eq(auditLog.entityId, entityId))).orderBy(asc(auditLog.at))
      return rows.map(audit)
    },
    async hit(actor, key, windowSeconds) {
      if (!Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86400) throw new TypeError("Invalid rate-limit window")
      const scoped = scopedKey(actor, key), start = sqlDate(new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000).toISOString())
      return withTransaction(async (db) => {
        const increment = sql.fromList([sql.raw("IF("), eq(rateLimits.windowStart, start), sql.raw(", "), rateLimits.count, sql.raw(" + 1, 1)")])
        await db.insert(rateLimits).values({ key: scoped, windowStart: start, count: 1 }).onDuplicateKeyUpdate({ set: { count: increment, windowStart: start } })
        const [row] = await db.select({ count: rateLimits.count }).from(rateLimits).where(eq(rateLimits.key, scoped))
        return row.count
      }, { retries: 3, idempotencyKey: "rate-limit:" + scoped + ":" + start })
    },
    async getIdempotent(actor, key) {
      const db = await database()
      const [row] = await db.select({ status: idempotencyKeys.status, body: idempotencyKeys.body }).from(idempotencyKeys).where(and(eq(idempotencyKeys.key, scopedKey(actor, key, true)), gte(idempotencyKeys.expiresAt, sqlNow()))).limit(1)
      return row ?? null
    },
    async saveIdempotent(actor, key, status, body) {
      const db = await database()
      const values = { key: scopedKey(actor, key, true), status, body, expiresAt: sqlDate(new Date(Date.now() + 86_400_000).toISOString()) }
      // First successful response wins; replay never rewrites a different result.
      await db.insert(idempotencyKeys).values(values).onDuplicateKeyUpdate({ set: { key: values.key } })
    },
    async ping(_actor) {
      await database()
      return true
    },
    async setFlag(actor, storeId, key, changes) {
      requireStore(actor, storeId); requireGrant(actor, "settings:flags")
      return withTransaction(async (db) => {
        const where = and(eq(featureFlags.storeId, actor.storeId), eq(featureFlags.key, key))
        const [row] = await db.select().from(featureFlags).where(where).for("update")
        if (!row) throw new DomainError("not_found", "Unknown flag.")
        await db.update(featureFlags).set({ enabled: changes.enabled ? 1 : 0, ...(changes.customerGroups !== undefined ? { groupsRestricted: changes.customerGroups !== null ? 1 : 0 } : {}) }).where(where)
        const groupWhere = and(eq(featureFlagCustomerGroups.storeId, actor.storeId), eq(featureFlagCustomerGroups.key, key))
        if (changes.customerGroups !== undefined) {
          await db.delete(featureFlagCustomerGroups).where(groupWhere)
          if (changes.customerGroups?.length) await db.insert(featureFlagCustomerGroups).values(changes.customerGroups.map((value, position) => ({ storeId, key, value, position })))
        }
        const groups = await db.select().from(featureFlagCustomerGroups).where(groupWhere).orderBy(featureFlagCustomerGroups.position)
        const restricted = changes.customerGroups !== undefined ? changes.customerGroups !== null : row.groupsRestricted === 1
        return { key, description: row.description, enabled: changes.enabled, ...(restricted ? { customerGroups: groups.map((group) => group.value) } : {}) }
      })
    },
    async searchAudit(actor, storeId, query) {
      requireStore(actor, storeId); requireGrant(actor, "audit:read")
      const db = await database()
      const where = and(eq(auditLog.storeId, actor.storeId), query.actor ? eq(auditLog.actor, query.actor) : undefined, query.entity ? eq(auditLog.entity, query.entity) : undefined, query.action ? like(auditLog.action, escapeLike(query.action) + "%") : undefined, query.q ? like(auditLog.entityId, "%" + escapeLike(query.q) + "%") : undefined, query.from ? gte(auditLog.at, sqlDate(query.from)) : undefined, query.to ? lt(auditLog.at, sqlDate(query.to)) : undefined)
      const pii = actor.permissions.includes("customers:read_pii")
      const [rows, [total]] = await Promise.all([db.select({ ...getTableColumns(auditLog), before: pii ? auditLog.before : constant(null), after: pii ? auditLog.after : constant(null) }).from(auditLog).where(where).orderBy(desc(auditLog.at), auditLog.id).limit(query.pageSize).offset((query.page - 1) * query.pageSize), db.select({ count: count() }).from(auditLog).where(where)])
      return { entries: rows.map(audit), total: total.count }
    },
    async outboxSummary(actor, storeId) {
      requireStore(actor, storeId)
      requireGrant(actor, actor.permissions.includes("settings:read") ? "settings:read" : "dashboard:read")
      const db = await database()
      const scope = eq(outboxEvents.storeId, actor.storeId), pii = actor.permissions.includes("customers:read_pii")
      const [counts, failed, deliveries] = await Promise.all([
        db.select({ status: outboxEvents.status, count: count() }).from(outboxEvents).where(scope).groupBy(outboxEvents.status),
        db.select({ ...getTableColumns(outboxEvents), payload: pii ? outboxEvents.payload : constant(null) }).from(outboxEvents).where(and(scope, eq(outboxEvents.status, "failed"))).orderBy(desc(outboxEvents.createdAt)).limit(20),
        db.select({ ...getTableColumns(webhookDeliveries), endpoint: actor.permissions.includes("settings:webhooks") ? webhookDeliveries.endpoint : constant("•••") }).from(webhookDeliveries).innerJoin(outboxEvents, eq(outboxEvents.id, webhookDeliveries.eventId)).where(scope).orderBy(desc(webhookDeliveries.at)).limit(20),
      ])
      const total = (status: string) => counts.find((row) => row.status === status)?.count ?? 0
      return { pending: total("pending"), delivered: total("delivered"), failed: total("failed"), recentFailed: failed.map((row) => event({ ...row, payload: row.payload ?? {} })), deliveries: deliveries.map(delivery) }
    },
    async retryEvent(actor, storeId, id) {
      requireStore(actor, storeId); requireGrant(actor, "jobs:run")
      const db = await database()
      const [result] = await db.update(outboxEvents).set({ status: "pending", availableAt: sqlNow(), lastError: null }).where(and(eq(outboxEvents.storeId, actor.storeId), eq(outboxEvents.id, id), eq(outboxEvents.status, "failed")))
      if (!result.affectedRows) throw new DomainError("conflict", "Only failed events can be retried.")
    },
  })
}
