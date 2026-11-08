import "server-only"

import { createHash, createHmac } from "node:crypto"

import { serverEnv } from "@/lib/env.server"
import { email } from "@/server/adapters/email"
import { currentStoreId } from "@/server/db/driver"
import { platform } from "@/server/platform"
import type { EventTopic, OutboxEvent } from "@/server/platform/types"
import { newId, now } from "@/server/shared/ids"
import { isPrivateDeliveryKey, sealDeliveryPayload } from "@/server/platform/private-payload"
import { DeliveryDeferred } from "./deferred"

const MAX_ATTEMPTS = 8

/** External work stays outside transactions; committed receipts survive another channel failing. */
async function deliverChannel(event: OutboxEvent, channel: string, send: () => Promise<void>) {
  const claim = await platform().claimDelivery(event.id, channel)
  if (claim.status === "delivered") return
  if (claim.status === "busy" || !claim.token) throw new DeliveryDeferred(new Date(Date.now() + 120_000).toISOString())
  try {
    await send()
    if (!await platform().finishDelivery(event.id, channel, claim.token, true)) throw new DeliveryDeferred(new Date(Date.now() + 120_000).toISOString())
  } catch (error) {
    await platform().finishDelivery(event.id, channel, claim.token, false)
    throw error
  }
}

/**
 * Transactional outbox: domain code records an event (in the same unit of work as the change
 * where the driver allows) and `/api/jobs/outbox` delivers it — emails and signed webhooks —
 * with retries and backoff. Nothing user-facing waits on a vendor.
 */
export async function publish(topic: EventTopic, payload: Record<string, unknown>) {
  return platform().enqueue(currentStoreId(), topic, sealDeliveryPayload(payload, serverEnv.SESSION_SECRET))
}

type Endpoint = { url: string; secret: string; topics: string[] }

/** WEBHOOK_ENDPOINTS="url|secret|topic1+topic2,url2|secret2|*" */
function endpoints(): Endpoint[] {
  return serverEnv.WEBHOOK_ENDPOINTS.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [url, secret, topics = "*"] = entry.split("|")
      return { url, secret, topics: topics.split("+") }
    })
}

/** HMAC-SHA256 over `${timestamp}.${body}`; receivers verify with the shared secret. */
export function signWebhook(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
}

/** Bearer secrets used only for customer email links; never sent to third-party endpoints. */
async function deliverWebhooks(event: OutboxEvent) {
  const data = Object.fromEntries(Object.entries(event.payload).filter(([key]) => !isPrivateDeliveryKey(key)))
  for (const endpoint of endpoints().filter((item) => item.topics.includes("*") || item.topics.includes(event.topic))) {
    await deliverChannel(event, "webhook:" + createHash("sha256").update(endpoint.url).digest("hex"), async () => {
    const body = JSON.stringify({ id: event.id, topic: event.topic, createdAt: event.createdAt, data })
    const timestamp = String(Math.floor(Date.now() / 1000))
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-soledrop-event": event.topic,
        "x-soledrop-delivery": event.id,
        "x-soledrop-timestamp": timestamp,
        "x-soledrop-signature": signWebhook(endpoint.secret, timestamp, body),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    await platform().recordDelivery({ id: newId(), eventId: event.id, endpoint: endpoint.url, status: response.ok ? "delivered" : "failed", responseStatus: response.status, at: now() })
    if (!response.ok) throw new Error(`Webhook ${endpoint.url} answered ${response.status}`)
    })
  }
}

/** Side effects per topic beyond webhooks (customer emails). */
async function handle(event: OutboxEvent) {
  await deliverChannel(event, "email", async () => email().sendForEvent(event))
  await deliverWebhooks(event)
}

/** Delivers due events; returns counts for the job response. */
export async function drainOutbox(limit = 50) {
  const events = await platform().claimDue(Math.min(limit, 10)), started = performance.now()
  let delivered = 0
  let failed = 0
  let deferred = 0
  for (const event of events) {
    if (performance.now() - started >= 20_000) {
      await platform().deferEvent(event.id, new Date(Date.now() + 60_000).toISOString())
      deferred++
      continue
    }
    try {
      await handle(event)
      await platform().markDelivered(event.id)
      delivered += 1
    } catch (error) {
      if (error instanceof DeliveryDeferred) {
        await platform().deferEvent(event.id, error.retryAt)
        deferred++
        continue
      }
      await platform().markFailed(event.id, error instanceof Error ? error.message : String(error), MAX_ATTEMPTS)
      failed += 1
    }
  }
  return { claimed: events.length, delivered, failed, deferred }
}
