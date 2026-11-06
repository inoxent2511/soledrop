export type FeatureFlag = {
  key: string
  description: string
  enabled: boolean
  /** Optional targeting: only these customer groups see the feature. */
  customerGroups?: string[]
}

export type EventTopic =
  | "order.placed"
  | "order.status_changed"
  | "payment.recorded"
  | "refund.created"
  | "return.requested"
  | "customer.registered"
  | "newsletter.subscribed"
  | "contact.received"
  | "password.reset_requested"

export type OutboxEvent = {
  id: string
  topic: EventTopic
  payload: Record<string, unknown>
  status: "pending" | "delivered" | "failed"
  attempts: number
  availableAt: string
  createdAt: string
  lastError: string | null
}

export type WebhookDelivery = {
  id: string
  eventId: string
  endpoint: string
  status: "delivered" | "failed"
  responseStatus: number | null
  at: string
}

export type AuditEntry = {
  id: string
  actor: string
  action: string
  entity: string
  entityId: string
  before: unknown
  after: unknown
  at: string
  /** Who acted, from where and why (admin, A-006); absent on phase 1 system entries. */
  storeId?: string | null
  actorRole?: string | null
  ip?: string | null
  userAgent?: string | null
  requestId?: string | null
  reason?: string | null
}
