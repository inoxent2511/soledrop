import "server-only"

import { searchTerm, supabase, unwrap } from "@/server/db/supabase"
import { DomainError } from "@/server/shared/errors"
import type { PlatformOperations } from "@/server/platform/repository"
import type { AuditEntry, FeatureFlag, OutboxEvent, WebhookDelivery } from "@/server/platform/types"

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

export function createSupabasePlatformRepository(): PlatformOperations {
  return {
    async claimDelivery() { throw new DomainError("unavailable", "Delivery channels require the migrated database.") },
    async finishDelivery() { throw new DomainError("unavailable", "Delivery channels require the migrated database.") },
    async deferEvent() { throw new DomainError("unavailable", "Delivery channels require the migrated database.") },
    async cleanup() { throw new DomainError("unavailable", "Cleanup requires the migrated database.") },
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
    async setFlag(storeId, key, changes) {
      const row = unwrap(
        await supabase()
          .from("feature_flags")
          .update({ enabled: changes.enabled, ...(changes.customerGroups !== undefined ? { customer_groups: changes.customerGroups } : {}) })
          .eq("store_id", storeId)
          .eq("key", key)
          .select("key, description, enabled, customer_groups")
          .maybeSingle(),
      ) as { key: string; description: string; enabled: boolean; customer_groups: string[] | null } | null
      if (!row) throw new DomainError("not_found", "Unknown flag.")
      return { key: row.key, description: row.description, enabled: row.enabled, customerGroups: row.customer_groups ?? undefined }
    },
    async searchAudit(storeId, query) {
      let request = supabase().from("audit_log").select("*", { count: "exact" }).or(`store_id.eq.${storeId},store_id.is.null`)
      if (query.actor) request = request.eq("actor", query.actor)
      if (query.entity) request = request.eq("entity", query.entity)
      if (query.action) request = request.like("action", `${query.action.replace(/[%_]/g, "")}%`)
      const term = query.q ? searchTerm(query.q) : ""
      if (term) request = request.ilike("entity_id", `%${term}%`)
      if (query.from) request = request.gte("at", query.from)
      if (query.to) request = request.lt("at", query.to)
      const start = (query.page - 1) * query.pageSize
      const result = await request.order("at", { ascending: false }).range(start, start + query.pageSize - 1)
      const rows = unwrap(result) as { id: string; actor: string; action: string; entity: string; entity_id: string; before: unknown; after: unknown; at: string; store_id: string | null; actor_role: string | null; ip: string | null; user_agent: string | null; request_id: string | null; reason: string | null }[]
      return {
        total: result.count ?? rows.length,
        entries: rows.map((row) => ({ id: row.id, actor: row.actor, action: row.action, entity: row.entity, entityId: row.entity_id, before: row.before, after: row.after, at: row.at, storeId: row.store_id, actorRole: row.actor_role, ip: row.ip, userAgent: row.user_agent, requestId: row.request_id, reason: row.reason })),
      }
    },
    async outboxSummary(storeId) {
      const count = async (status: string) => (await supabase().from("outbox_events").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", status)).count ?? 0
      const [pending, delivered, failed] = await Promise.all([count("pending"), count("delivered"), count("failed")])
      const failedRows = unwrap(await supabase().from("outbox_events").select("*").eq("store_id", storeId).eq("status", "failed").order("created_at", { ascending: false }).limit(20)) as { id: string; topic: OutboxEvent["topic"]; payload: Record<string, unknown>; status: OutboxEvent["status"]; attempts: number; available_at: string; created_at: string; last_error: string | null }[]
      const deliveryRows = unwrap(await supabase().from("webhook_deliveries").select("id, event_id, endpoint, status, response_status, at, outbox_events!inner(store_id)").eq("outbox_events.store_id", storeId).order("at", { ascending: false }).limit(20)) as unknown as { id: string; event_id: string; endpoint: string; status: WebhookDelivery["status"]; response_status: number | null; at: string }[]
      return {
        pending,
        delivered,
        failed,
        recentFailed: failedRows.map((row) => ({ id: row.id, topic: row.topic, payload: row.payload, status: row.status, attempts: row.attempts, availableAt: row.available_at, createdAt: row.created_at, lastError: row.last_error })),
        deliveries: deliveryRows.map((row) => ({ id: row.id, eventId: row.event_id, endpoint: row.endpoint, status: row.status, responseStatus: row.response_status, at: row.at })),
      }
    },
    async retryEvent(storeId, id) {
      const rows = unwrap(await supabase().from("outbox_events").update({ status: "pending", available_at: new Date().toISOString(), last_error: null }).eq("store_id", storeId).eq("id", id).eq("status", "failed").select("id")) as { id: string }[]
      if (!rows.length) throw new DomainError("conflict", "Only failed events can be retried.")
    },
  }
}
