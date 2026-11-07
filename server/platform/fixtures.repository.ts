import "server-only"
import { serverEnv } from "@/lib/env.server"
import { sealDeliveryPayload } from "@/server/platform/private-payload"

import { db } from "@/server/fixtures/store"
import { DomainError } from "@/server/shared/errors"
import type { PlatformRepository } from "@/server/platform/repository"
import { newId, now } from "@/server/shared/ids"

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

export function createFixturesPlatformRepository(): PlatformRepository {
  return {
    async listFlags() {
      return db().flags
    },
    async enqueue(_storeId, topic, payload) {
      payload = sealDeliveryPayload(payload, serverEnv.SESSION_SECRET)
      const event = { id: newId(), topic, payload, status: "pending" as const, attempts: 0, availableAt: now(), createdAt: now(), lastError: null }
      db().outbox.push(event)
      return event
    },
    async claimDue(limit) {
      const at = Date.now()
      return db()
        .outbox.filter((event) => event.status === "pending" && Date.parse(event.availableAt) <= at)
        .slice(0, limit)
        .map((event) => {
          event.attempts += 1
          event.availableAt = new Date(at + 60_000).toISOString()
          return structuredClone(event)
        })
    },
    async markDelivered(id) {
      const event = db().outbox.find((row) => row.id === id)
      if (event) event.status = "delivered"
    },
    async markFailed(id, error, maxAttempts) {
      const event = db().outbox.find((row) => row.id === id)
      if (!event) return
      event.lastError = error
      if (event.attempts >= maxAttempts) event.status = "failed"
      else event.availableAt = new Date(Date.now() + 2 ** event.attempts * 30_000).toISOString()
    },
    async recordDelivery(delivery) {
      db().webhookDeliveries.push(delivery)
    },
    async audit(entry) {
      db().audit.push({ ...entry, id: newId(), at: now() })
    },
    async listAudit(entity, entityId) {
      return db().audit.filter((entry) => entry.entity === entity && entry.entityId === entityId)
    },
    async hit(key, windowSeconds) {
      const limits = db().rateLimits
      const windowStart = Math.floor(Date.now() / (windowSeconds * 1000))
      const current = limits.get(key)
      const next = current && current.windowStart === windowStart ? { windowStart, count: current.count + 1 } : { windowStart, count: 1 }
      limits.set(key, next)
      return next.count
    },
    async getIdempotent(key) {
      const entry = db().idempotency.get(key)
      if (!entry || Date.now() - entry.at > IDEMPOTENCY_TTL_MS) return null
      return { status: entry.status, body: entry.body }
    },
    async saveIdempotent(key, status, body) {
      db().idempotency.set(key, { status, body, at: Date.now() })
    },
    async ping() {
      return Array.isArray(db().products)
    },
    async setFlag(_storeId, key, changes) {
      const flag = db().flags.find((row) => row.key === key)
      if (!flag) throw new DomainError("not_found", "Unknown flag.")
      flag.enabled = changes.enabled
      if (changes.customerGroups !== undefined) flag.customerGroups = changes.customerGroups ?? undefined
      return structuredClone(flag)
    },
    async searchAudit(storeId, query) {
      const q = query.q?.trim().toLowerCase()
      const found = db()
        .audit.filter((entry) => (entry.storeId ?? storeId) === storeId)
        .filter((entry) => (!query.actor || entry.actor === query.actor) && (!query.entity || entry.entity === query.entity) && (!query.action || entry.action.startsWith(query.action)))
        .filter((entry) => !q || entry.entityId.toLowerCase().includes(q))
        .filter((entry) => (!query.from || entry.at >= query.from) && (!query.to || entry.at < query.to))
        .sort((a, b) => b.at.localeCompare(a.at))
      const start = (query.page - 1) * query.pageSize
      return { entries: structuredClone(found.slice(start, start + query.pageSize)), total: found.length }
    },
    async outboxSummary() {
      const outbox = db().outbox
      return {
        pending: outbox.filter((event) => event.status === "pending").length,
        delivered: outbox.filter((event) => event.status === "delivered").length,
        failed: outbox.filter((event) => event.status === "failed").length,
        recentFailed: structuredClone(outbox.filter((event) => event.status === "failed").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20)),
        deliveries: structuredClone([...db().webhookDeliveries].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20)),
      }
    },
    async retryEvent(_storeId, id) {
      const event = db().outbox.find((row) => row.id === id)
      if (!event) throw new DomainError("not_found", "Event not found.")
      if (event.status !== "failed") throw new DomainError("conflict", "Only failed events can be retried.")
      event.status = "pending"
      event.availableAt = now()
      event.lastError = null
    },
  }
}
