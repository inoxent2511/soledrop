import "server-only"

import { seal, unseal } from "@/server/admin/crypto"

const keys = new Set(["token", "accessToken"])
const purpose = "outbox-delivery-token"

/** Bearer links must survive delayed delivery without being stored as plaintext in the DB. */
export function sealDeliveryPayload(payload: Record<string, unknown>, secret: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => keys.has(key) && typeof value === "string" ? [key + "Sealed", seal(value, secret, purpose)] : [key, value]))
}

/** Only the email renderer opens delivery secrets. The event sent to webhooks stays sealed. */
export function openDeliveryPayload(payload: Record<string, unknown>, secret: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => key.endsWith("Sealed") && keys.has(key.slice(0, -6)) && typeof value === "string" ? [key.slice(0, -6), unseal(value, secret, purpose)] : [key, value]))
}

export const isPrivateDeliveryKey = (key: string) => keys.has(key) || key.endsWith("Sealed") && keys.has(key.slice(0, -6))
