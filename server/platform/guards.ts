import "server-only"

import { platform } from "@/server/platform"
import { DomainError } from "@/server/shared/errors"

/** Named limits: requests per window, per client key (IP or customer). */
export const RATE_LIMITS = {
  checkout: { limit: 10, windowSeconds: 60 },
  auth: { limit: 10, windowSeconds: 300 },
  contact: { limit: 5, windowSeconds: 600 },
  newsletter: { limit: 5, windowSeconds: 600 },
  cart: { limit: 120, windowSeconds: 60 },
  api: { limit: 600, windowSeconds: 60 },
  lookup: { limit: 20, windowSeconds: 300 },
  /** As-you-type suggestions: a fast typist with the 150 ms debounce stays far below this. */
  search: { limit: 120, windowSeconds: 60 },
  searchEvents: { limit: 60, windowSeconds: 60 },
} as const

/** Throws rate_limited when the client exceeds the named limit. */
export async function enforceRateLimit(name: keyof typeof RATE_LIMITS, clientKey: string) {
  const { limit, windowSeconds } = RATE_LIMITS[name]
  const count = await platform().hit(`${name}:${clientKey}`, windowSeconds)
  if (count > limit) throw new DomainError("rate_limited", "Too many attempts — please wait a minute and try again.", { retryAfter: windowSeconds })
}

/**
 * Replays the stored response for a repeated Idempotency-Key, otherwise runs `work` and stores
 * its result. Keys are scoped (e.g. "checkout:<cart>") so different endpoints can't collide.
 */
export async function withIdempotency<T>(scope: string, key: string | null, work: () => Promise<{ status: number; body: T }>) {
  if (!key) return work()
  const scoped = `${scope}:${key}`
  const previous = await platform().getIdempotent(scoped)
  if (previous) return previous as { status: number; body: T }
  const result = await work()
  if (result.status < 500) await platform().saveIdempotent(scoped, result.status, result.body)
  return result
}

/** Mandatory audit failures propagate so the enclosing mutation can roll back. */
export async function audit(actor: string, action: string, entity: string, entityId: string, before: unknown, after: unknown) {
  await platform().audit({ actor, action, entity, entityId, before, after })
}
