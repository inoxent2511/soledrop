import "server-only"

import { supabase, unwrap } from "@/server/db/supabase"
import type { PlatformRepository } from "@/server/platform/repository"
import type { AuditEntry, FeatureFlag, OutboxEvent } from "@/server/platform/types"

type OutboxRecord = {
  id: string
  topic: OutboxEvent["topic"]
  payload: Record<string, unknown>
  status: OutboxEvent["status"]
  attempts: number
  available_at: string
  created_at: string
  last_error: string | null
}

const toEvent = (row: OutboxRecord): OutboxEvent => ({
  id: row.id,
  topic: row.topic,
  payload: row.payload,
  status: row.status,
  attempts: row.attempts,
  availableAt: row.available_at,
  createdAt: row.created_at,
  lastError: row.last_error,
})

export function createSupabasePlatformRepository(): PlatformRepository {
  return {
    async listFlags(storeId) {
      const rows = unwrap(
        await supabase().from("feature_flags").select("key, description, enabled, customer_groups").eq("store_id", storeId),
      ) as { key: string; description: string; enabled: boolean; customer_groups: string[] | null }[]
      return rows.map((row): FeatureFlag => ({ key: row.key, description: row.description, enabled: row.enabled, customerGroups: row.customer_groups ?? undefined }))
    },
    async enqueue(storeId, topic, payload) {
      const row = unwrap(await supabase().from("outbox_events").insert({ store_id: storeId, topic, payload }).select("*").single()) as OutboxRecord
      return toEvent(row)
    },
    async claimDue(limit) {
      const rows = unwrap(await supabase().rpc("claim_outbox_events", { p_limit: limit })) as OutboxRecord[]
      return rows.map(toEvent)
    },
    async markDelivered(id) {
      unwrap(await supabase().from("outbox_events").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("id", id))
    },
    async markFailed(id, error, maxAttempts) {
      unwrap(await supabase().rpc("fail_outbox_event", { p_id: id, p_error: error, p_max_attempts: maxAttempts }))
    },
    async recordDelivery(delivery) {
      unwrap(
        await supabase().from("webhook_deliveries").insert({
          id: delivery.id,
          event_id: delivery.eventId,
          endpoint: delivery.endpoint,
          status: delivery.status,
          response_status: delivery.responseStatus,
        }),
      )
    },
    async audit(entry) {
      unwrap(
        await supabase().from("audit_log").insert({
          actor: entry.actor,
          action: entry.action,
          entity: entry.entity,
          entity_id: entry.entityId,
          before: entry.before ?? null,
          after: entry.after ?? null,
          store_id: entry.storeId ?? null,
          actor_role: entry.actorRole ?? null,
          ip: entry.ip ?? null,
          user_agent: entry.userAgent ?? null,
          request_id: entry.requestId ?? null,
          reason: entry.reason ?? null,
        }),
      )
    },
    async listAudit(entity, entityId) {
      const rows = unwrap(
        await supabase().from("audit_log").select("id, actor, action, entity, entity_id, before, after, at").eq("entity", entity).eq("entity_id", entityId).order("at"),
      ) as (Omit<AuditEntry, "entityId"> & { entity_id: string })[]
      return rows.map(({ entity_id, ...row }) => ({ ...row, entityId: entity_id }))
    },
    async hit(key, windowSeconds) {
      return unwrap(await supabase().rpc("rate_limit_hit", { p_key: key, p_window_seconds: windowSeconds })) as number
    },
    async getIdempotent(key) {
      const row = unwrap(
        await supabase().from("idempotency_keys").select("status, body").eq("key", key).gt("expires_at", new Date().toISOString()).maybeSingle(),
      ) as { status: number; body: unknown } | null
      return row
    },
    async saveIdempotent(key, status, body) {
      unwrap(await supabase().from("idempotency_keys").upsert({ key, status, body }))
    },
    async ping() {
      const result = await supabase().from("stores").select("id").limit(1)
      return !result.error
    },
  }
}
