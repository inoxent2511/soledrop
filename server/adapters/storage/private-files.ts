import "server-only"

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import type { Actor } from "@/server/db/actor"
import { assertActor, requireStore } from "@/server/db/actor"
import { uuidToBytes } from "@/server/db/uuid"
import { DomainError } from "@/server/shared/errors"
import type { StorageAdapter } from "./types"

export type PrivateResource = { kind: "order" | "customer"; id: string }
const signature = (body: string, secret: string) => createHmac("sha256", secret).update("private-file:v1:" + body).digest("base64url")

function prefix(storeId: string, resource: PrivateResource) {
  uuidToBytes(storeId); uuidToBytes(resource.id)
  if (!["order", "customer"].includes(resource.kind)) throw new DomainError("validation", "Invalid private resource.")
  return "private/" + storeId + "/" + resource.kind + "/" + resource.id + "/"
}

/** Signing is available only after the owning domain has admitted the explicit actor. */
export function createPrivateFiles(deps: { storeId: string; secret: string; storage: StorageAdapter; authorize: (actor: Actor, resource: PrivateResource) => Promise<void>; clock?: () => number }) {
  const clock = deps.clock ?? Date.now
  const admit = async (actor: Actor, resource: PrivateResource) => { assertActor(actor); requireStore(actor, deps.storeId); await deps.authorize(actor, resource) }
  return {
    async put(actor: Actor, resource: PrivateResource, bytes: Uint8Array) {
      await admit(actor, resource)
      if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new DomainError("validation", "Private files must be between 1 byte and 10 MB.")
      const key = prefix(deps.storeId, resource) + randomUUID() + ".bin"
      await deps.storage.put(key, bytes)
      return key
    },
    async signedUrl(actor: Actor, resource: PrivateResource, key: string, ttlSeconds = 300) {
      await admit(actor, resource)
      if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300 || !key.startsWith(prefix(deps.storeId, resource)) || /[\\\x00-\x1f]/.test(key) || key.split("/").some((part) => !part || part === "." || part === "..")) throw new DomainError("forbidden", "Invalid private file capability.")
      const body = Buffer.from(JSON.stringify({ key, expires: clock() + ttlSeconds * 1000 })).toString("base64url")
      return "/api/private-files?token=" + body + "." + signature(body, deps.secret)
    },
  }
}

/** Bearer URLs are purpose/store/expiry bound. No unsigned storage path is accepted. */
export function privateFileKey(token: string, storeId: string, secret: string, now = Date.now()): string {
  const denied = () => new DomainError("unauthorized", "This download link expired or is invalid.")
  if (token.length > 2048) throw denied()
  const [body, proof, extra] = token.split(".")
  if (!body || !proof || extra) throw denied()
  const actual = Buffer.from(proof), expected = Buffer.from(signature(body, secret))
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw denied()
  let value: { key?: unknown; expires?: unknown }
  try { value = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as typeof value } catch { throw denied() }
  if (!value || typeof value.key !== "string" || !value.key.startsWith("private/" + storeId + "/") || /[\\\x00-\x1f]/.test(value.key) || value.key.split("/").some((part) => !part || part === "." || part === "..") || typeof value.expires !== "number" || !Number.isSafeInteger(value.expires) || value.expires <= now || value.expires > now + 300_000) throw denied()
  return value.key
}
