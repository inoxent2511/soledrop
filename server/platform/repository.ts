import type { ActorScoped } from "@/server/db/actor"
import type { AuditEntry, EventTopic, FeatureFlag, OutboxEvent, WebhookDelivery } from "@/server/platform/types"

export interface PlatformOperations {
  listFlags(storeId: string): Promise<FeatureFlag[]>
  enqueue(storeId: string, topic: EventTopic, payload: Record<string, unknown>): Promise<OutboxEvent>
  /** Claims up to `limit` due events (status pending, available_at ≤ now) for delivery. */
  claimDue(limit: number): Promise<OutboxEvent[]>
  markDelivered(id: string): Promise<void>
  /** Exponential backoff; after `maxAttempts` the event is parked as failed. */
  markFailed(id: string, error: string, maxAttempts: number): Promise<void>
  recordDelivery(delivery: WebhookDelivery): Promise<void>
  audit(entry: Omit<AuditEntry, "id" | "at">): Promise<void>
  listAudit(entity: string, entityId: string): Promise<AuditEntry[]>
  /** Fixed-window counter; returns the count after incrementing. */
  hit(key: string, windowSeconds: number): Promise<number>
  getIdempotent(key: string): Promise<{ status: number; body: unknown } | null>
  saveIdempotent(key: string, status: number, body: unknown): Promise<void>
  ping(): Promise<boolean>

  // ─── Staff (admin A9) ─────────────────────────────────────────────────────
  setFlag(storeId: string, key: string, changes: { enabled: boolean; customerGroups?: string[] | null }): Promise<FeatureFlag>
  /** The audit log, newest first; `q` matches the entity id. Entries without a store (system) are included. */
  searchAudit(storeId: string, query: AuditQuery): Promise<{ entries: AuditEntry[]; total: number }>
  /** Counts by status, and the most recent failed events. */
  outboxSummary(storeId: string): Promise<{ pending: number; delivered: number; failed: number; recentFailed: OutboxEvent[]; deliveries: WebhookDelivery[] }>
  /** Puts a failed event back in the queue for the next worker run. */
  retryEvent(storeId: string, id: string): Promise<void>
  claimDelivery(eventId: string, channel: string): Promise<{ status: "claimed" | "delivered" | "busy"; token: string | null }>
  finishDelivery(eventId: string, channel: string, token: string, delivered: boolean): Promise<boolean>
  deferEvent(eventId: string, availableAt: string): Promise<void>
  cleanup(limit: number): Promise<{ rateLimits: number; idempotency: number; sessions: number; tokens: number }>
}

export type AuditQuery = { actor?: string; entity?: string; action?: string; q?: string; from?: string; to?: string; page: number; pageSize: number }

/** Raw storage boundary; services receive explicitly bound operations. */
export type PlatformRepository = ActorScoped<PlatformOperations>
