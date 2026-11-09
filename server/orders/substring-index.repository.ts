import "server-only"
import { and, eq, exists, not } from "drizzle-orm"
import type { Database } from "@/server/db/client"
import type { Actor } from "@/server/db/actor"
import { orderSearchGrams, orderSearchLinks, orderSearchValues as values } from "@/server/db/schema"
import { orderSearchValues } from "./search-values"

/** Parent/store are locked by the caller. Unused PII values and their grams are erased. */
export async function syncOrderSubstrings(db: Database, actor: Actor, orderId: string, input: Parameters<typeof orderSearchValues>[0]) {
  const next = orderSearchValues(input), wanted = new Set(next.map((row) => row.valueHash))
  const previous = await db.select({ valueHash: orderSearchLinks.valueHash }).from(orderSearchLinks).where(and(eq(orderSearchLinks.storeId, actor.storeId), eq(orderSearchLinks.orderId, orderId))).for("update")
  const current = new Set(previous.map((row) => row.valueHash))
  for (const row of next.filter((row) => !current.has(row.valueHash))) {
    const [existing] = await db.select({ id: values.valueHash }).from(values).where(and(eq(values.storeId, actor.storeId), eq(values.valueHash, row.valueHash))).for("update")
    if (!existing) {
      await db.insert(values).values({ storeId: actor.storeId, valueHash: row.valueHash, kind: row.kind, normalizedText: row.normalizedText })
      // Bound parameter counts for maximum-length Unicode fields.
      for (let start = 0; start < row.grams.length; start += 250) await db.insert(orderSearchGrams).values(row.grams.slice(start, start + 250).map((gram) => ({ storeId: actor.storeId, valueHash: row.valueHash, gram })))
    }
    await db.insert(orderSearchLinks).values({ storeId: actor.storeId, orderId, valueHash: row.valueHash })
  }
  for (const row of previous.filter((row) => !wanted.has(row.valueHash))) {
    await db.delete(orderSearchLinks).where(and(eq(orderSearchLinks.storeId, actor.storeId), eq(orderSearchLinks.orderId, orderId), eq(orderSearchLinks.valueHash, row.valueHash)))
    await db.delete(values).where(and(eq(values.storeId, actor.storeId), eq(values.valueHash, row.valueHash), not(exists(db.select({ id: orderSearchLinks.orderId }).from(orderSearchLinks).where(and(eq(orderSearchLinks.storeId, actor.storeId), eq(orderSearchLinks.valueHash, row.valueHash)))))))
  }
}
