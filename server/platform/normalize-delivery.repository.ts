import "server-only"
import { and, asc, eq, gt } from "drizzle-orm"
import { requireSystem, type Actor } from "@/server/db/actor"
import { withTransaction } from "@/server/db/client"
import { outboxEvents } from "@/server/db/schema"
import { jsonValue } from "@/server/db/values"
import { lockStore } from "@/server/inventory/mysql.repository"
import { auditOrder } from "@/server/orders/mysql-helpers.repository"
import { openDeliveryPayload, sealDeliveryPayload } from "./private-payload"
import { serverEnv } from "@/lib/env.server"
import { DomainError } from "@/server/shared/errors"

/** Normalize old queued bearer fields without changing the link, schedule or delivery state. */
export async function normalizeDeliverySecrets(actor: Actor, cursor: string | null, limit = 100) {
  requireSystem(actor, ["migration"])
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new DomainError("validation", "Invalid normalization batch.")
  return withTransaction(async (db) => {
    await lockStore(db, actor)
    const rows = await db.select({ id: outboxEvents.id, payload: outboxEvents.payload }).from(outboxEvents).where(and(eq(outboxEvents.storeId, actor.storeId), cursor ? gt(outboxEvents.id, cursor) : undefined)).orderBy(asc(outboxEvents.id)).limit(limit).for("update")
    let changed = 0
    for (const row of rows) {
      const payload = jsonValue<Record<string, unknown>>(row.payload), sealed = sealDeliveryPayload(payload, serverEnv.SESSION_SECRET)
      // Also verify that imported sealed links open with the preserved deployment key.
      if (JSON.stringify(openDeliveryPayload(sealed, serverEnv.SESSION_SECRET)) !== JSON.stringify(openDeliveryPayload(payload, serverEnv.SESSION_SECRET))) throw new DomainError("unavailable", "Delivery-link preservation verification failed.")
      if (JSON.stringify(payload) !== JSON.stringify(sealed)) {
        await db.update(outboxEvents).set({ payload: sealed }).where(and(eq(outboxEvents.storeId, actor.storeId), eq(outboxEvents.id, row.id)))
        changed++
      }
    }
    if (changed) await auditOrder(db, actor, "outbox.secrets_normalized", "outbox", "*", null, { changed })
    return { count: rows.length, changed, cursor: rows.at(-1)?.id ?? cursor }
  })
}
