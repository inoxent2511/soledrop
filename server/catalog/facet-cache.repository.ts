import "server-only"
import { createHash } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { assertActor, requireGrant, type Actor } from "@/server/db/actor"
import { type Database, inDatabaseTransaction } from "@/server/db/client"
import { catalogueReadRevisions } from "@/server/db/schema"

const entries = new Map<string, unknown>(), pending = new Map<string, Promise<unknown>>()
const databaseScopes = new WeakMap<Database, number>()
let nextDatabaseScope = 0
const CAPACITY = 16, MAX_ENTRY_BYTES = 256 * 1024

export async function catalogueRevision(db: Database, actor: Actor): Promise<number> {
  assertActor(actor)
  const [row] = await db.select({ revision: catalogueReadRevisions.revision }).from(catalogueReadRevisions).where(eq(catalogueReadRevisions.storeId, actor.storeId))
  return row?.revision ?? 0
}

/** Every caller already holds the store lock and its mutation transaction. */
export async function bumpCatalogueRevision(db: Database, actor: Actor) {
  assertActor(actor)
  if (actor.kind !== "system" || actor.purpose !== "migration") {
    const permission = actor.permissions.includes("products:write") ? "products:write" : actor.permissions.includes("pricing:write") ? "pricing:write" : actor.permissions.includes("products:delete") ? "products:delete" : "collections:write"
    requireGrant(actor, permission)
  }
  await db.insert(catalogueReadRevisions).values({ storeId: actor.storeId, revision: 1 }).onDuplicateKeyUpdate({ set: { revision: sql.fromList([catalogueReadRevisions.revision, sql.raw(" + 1")]) } })
}

/** Cache only committed, stable facets. Stock and page hydration are separate live reads. */
export async function readFacetRows<T>(db: Database, actor: Actor, scope: unknown, revision: number | undefined, load: () => Promise<T>): Promise<T> {
  if (revision === undefined || inDatabaseTransaction()) return load()
  let databaseScope = databaseScopes.get(db)
  if (databaseScope === undefined) { databaseScope = ++nextDatabaseScope; databaseScopes.set(db, databaseScope) }
  const digest = createHash("sha256").update(JSON.stringify([databaseScope, actor.storeId, scope, revision])).digest("hex")
  if (entries.has(digest)) {
    const found = entries.get(digest)
    entries.delete(digest); entries.set(digest, found)
    return structuredClone(found) as T
  }
  const existing = pending.get(digest)
  if (existing) return structuredClone(await existing) as T
  const operation = (async () => {
    const result = await load()
    // Also covers query-dictionary construction: its revision was read before
    // matching terms. A concurrent commit must never poison a newer revision.
    if (await catalogueRevision(db, actor) === revision && Buffer.byteLength(JSON.stringify(result)) <= MAX_ENTRY_BYTES) {
      entries.set(digest, structuredClone(result))
      while (entries.size > CAPACITY) entries.delete(entries.keys().next().value!)
    }
    return result
  })()
  if (pending.size < CAPACITY) pending.set(digest, operation)
  try { return structuredClone(await operation) }
  finally { if (pending.get(digest) === operation) pending.delete(digest) }
}
