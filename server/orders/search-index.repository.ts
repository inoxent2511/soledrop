import "server-only"
import { and, asc, eq, gt, sql } from "drizzle-orm"
import { requireSystem, type Actor } from "@/server/db/actor"
import { type Database, withTransaction } from "@/server/db/client"
import { orderSearchDocuments, orders } from "@/server/db/schema"
import { jsonValue } from "@/server/db/values"
import { lockStore } from "@/server/inventory/mysql.repository"
import { orderSearchText } from "./search-document"
import { syncOrderSubstrings } from "./substring-index.repository"

export const ORDER_REINDEX_BATCH = 100

const fields = { id: orders.id, storeId: orders.storeId, number: orders.number, email: orders.email, phone: orders.phone, shippingAddress: orders.shippingAddress, status: orders.status, paymentStatus: orders.paymentStatus, paymentMethod: orders.paymentMethod, placedAt: orders.placedAt, total: orders.total }
type SearchOrder = { [K in keyof typeof fields]: typeof fields[K]["_"]["data"] }
async function write(db: Database, actor: Actor, rows: SearchOrder[]) {
  if (!rows.length) return
  for (const row of rows) await syncOrderSubstrings(db, actor, row.id, { ...row, fullName: jsonValue<{ fullName: string }>(row.shippingAddress).fullName })
  const values = rows.map((row) => ({ storeId: row.storeId, orderId: row.id, ...orderSearchText({ ...row, fullName: jsonValue<{ fullName: string }>(row.shippingAddress).fullName }), status: row.status, paymentStatus: row.paymentStatus, paymentMethod: row.paymentMethod, placedAt: row.placedAt, total: row.total, searchVersion: 1 }))
  await db.insert(orderSearchDocuments).values(values).onDuplicateKeyUpdate({ set: {
    searchText: sql.raw("VALUES(search_text)"), numberBytes: sql.raw("VALUES(number_bytes)"), emailBytes: sql.raw("VALUES(email_bytes)"), phoneBytes: sql.raw("VALUES(phone_bytes)"), phoneDigits: sql.raw("VALUES(phone_digits)"), status: sql.raw("VALUES(status)"), paymentStatus: sql.raw("VALUES(payment_status)"), paymentMethod: sql.raw("VALUES(payment_method)"), placedAt: sql.raw("VALUES(placed_at)"), total: sql.raw("VALUES(total)"), searchVersion: sql.raw("VALUES(search_version)"),
  } })
}

/** Called inside the order write transaction, after its store/parent locks. */
export async function syncOrderSearch(db: Database, actor: Actor, orderId: string) {
  const [row] = await db.select(fields).from(orders).where(and(eq(orders.storeId, actor.storeId), eq(orders.id, orderId))).for("update")
  if (row) await write(db, actor, [row])
}

/** Bounded restartable backfill; never changes order versions or merchant data. */
export async function reindexOrderSearch(actor: Actor, cursor: string | null) {
  requireSystem(actor, ["migration"])
  return withTransaction(async (db) => {
    await lockStore(db, actor)
    const rows = await db.select(fields).from(orders).where(and(eq(orders.storeId, actor.storeId), cursor ? gt(orders.id, cursor) : undefined)).orderBy(asc(orders.id)).limit(ORDER_REINDEX_BATCH).for("update")
    await write(db, actor, rows)
    return { count: rows.length, cursor: rows.at(-1)?.id ?? cursor }
  })
}
