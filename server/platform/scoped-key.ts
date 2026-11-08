import { createHash } from "node:crypto"
import type { Actor } from "@/server/db/actor"
import { DomainError } from "@/server/shared/errors"

/** Rate limits are store-scoped; cached private responses also require the same identity. */
export function scopedKey(actor: Actor, key: string, identity = false) {
  const owner = actor.kind === "anonymous" ? actor.cartTokenHash ?? actor.orderAccessTokenHash : actor.id
  if (identity && !owner) throw new DomainError("forbidden", "A session or cart capability is required.")
  return createHash("sha256").update(actor.storeId + ":" + (identity ? actor.kind + ":" + owner + ":" : "") + key).digest("hex")
}
