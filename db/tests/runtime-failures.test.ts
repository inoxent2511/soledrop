import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { eq, sql } from "drizzle-orm"
import { closeDatabase, database, databaseStatus, withTransaction } from "@/server/db/client"
import { orders, rateLimits, stores } from "@/server/db/schema"
import { uuidv7 } from "@/server/db/uuid"
import { connect, engines } from "./connections"
import { mysqlPolicy } from "@/server/db/policy.repository"
import { systemActor, requireGrant } from "@/server/db/actor"
import { syncOrderSearch } from "@/server/orders/search-index.repository"

function scalar(result: unknown): number {
  if (!Array.isArray(result)) throw new Error("Expected a result tuple")
  const rows: unknown = result[0]
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Expected one result row")
  const row: unknown = rows[0]
  if (!row || typeof row !== "object" || !("alive" in row)) throw new Error("Missing query result")
  return Number(row.alive)
}

for (const [engine, config] of engines) describe(engine + " runtime database failure drills", () => {
  const keys = ["DATABASE_POOL_MAX", "DATABASE_ACQUIRE_TIMEOUT_MS", "DATABASE_QUERY_TIMEOUT_MS", "DATABASE_TRANSACTION_TIMEOUT_MS"]
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  const actor = systemActor(uuidv7(), "integration", ["settings:read"])
  const reads = mysqlPolicy<{ execute(query: import("drizzle-orm").SQL): Promise<unknown> }>({
    async execute(current, query) { requireGrant(current, "settings:read"); return (await database()).execute(query) },
  })
  beforeAll(async () => {
    await closeDatabase(); process.env.DATABASE_URL = config.appUrl
    Object.assign(process.env, { DATABASE_POOL_MAX: "1", DATABASE_ACQUIRE_TIMEOUT_MS: "300", DATABASE_QUERY_TIMEOUT_MS: "500", DATABASE_TRANSACTION_TIMEOUT_MS: "1200" })
    await database()
  })
  afterAll(async () => {
    await closeDatabase()
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key] }
    process.env.DATABASE_URL = config.appUrl
  })
  it("bounds a slow read, discards its socket, cancels abandoned engine work and serves the next read safely", async () => {
    const db = await database(), thread = scalar(await db.execute(sql`SELECT CONNECTION_ID() AS alive`))
    expect(scalar(await db.execute(engine === "mariadb" ? sql`SELECT @@max_statement_time * 1000 AS alive` : sql`SELECT @@max_execution_time AS alive`))).toBe(750)
    const observer = await connect(config.appUrl)
    try {
      const active = async () => {
        const [rows] = await observer.execute<import("mysql2/promise").RowDataPacket[]>("SELECT COUNT(*) AS total FROM information_schema.PROCESSLIST WHERE ID=?", [thread])
        return Number(rows[0].total)
      }
      expect(await active()).toBe(1)
      const started = performance.now()
      await expect(reads.execute(actor, sql`SELECT SLEEP(2)`)).rejects.toMatchObject({ code: "unavailable" })
      expect(performance.now() - started).toBeLessThan(1500)
      const until = performance.now() + 1200
      while (await active() && performance.now() < until) await new Promise((resolve) => setTimeout(resolve, 50))
      expect(await active()).toBe(0)
      expect(scalar(await (await database()).execute(sql`SELECT CONNECTION_ID() AS alive`))).not.toBe(thread)
      expect(scalar(await (await database()).execute(sql`SELECT 1 AS alive`))).toBe(1)
    } finally { await observer.end() }
  })
  it("bounds pool acquisition without running a timed-out queued read later", async () => {
    let entered!: () => void, release!: () => void
    const admitted = new Promise<void>((resolve) => { entered = resolve }), gate = new Promise<void>((resolve) => { release = resolve })
    const held = withTransaction(async () => { entered(); await gate; return true })
    await admitted
    try {
      const started = performance.now()
      await expect(reads.execute(actor, sql`SELECT 99`)).rejects.toMatchObject({ code: "unavailable" })
      expect(performance.now() - started).toBeLessThan(1000)
    } finally { release(); await held }
    expect(scalar(await (await database()).execute(sql`SELECT 2 AS alive`))).toBe(2)
  })
  it("rolls back an overlong transaction and prevents its delayed callback from writing", async () => {
    const key = "runtime-expiry:" + uuidv7()
    await expect(withTransaction(async (db) => {
      await db.insert(rateLimits).values({ key, count: 1, windowStart: "2000-01-01 00:00:00.000" })
      await new Promise((resolve) => setTimeout(resolve, 1600))
      await db.update(rateLimits).set({ count: 2 }).where(eq(rateLimits.key, key))
    })).rejects.toMatchObject({ code: "unavailable" })
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(await (await database()).select().from(rateLimits).where(eq(rateLimits.key, key))).toEqual([])
  })
  it("rejects migration checksum drift and recovers after restoration", async () => {
    const migrator = await connect(config.migratorUrl)
    const [rows] = await migrator.query<import("mysql2/promise").RowDataPacket[]>("SELECT name, checksum FROM schema_migrations ORDER BY name DESC LIMIT 1")
    try {
      await migrator.execute("UPDATE schema_migrations SET checksum = ? WHERE name = ?", ["0".repeat(64), rows[0].name])
      await expect(databaseStatus()).rejects.toMatchObject({ code: "unavailable", details: { check: "schema" } })
    } finally { await migrator.execute("UPDATE schema_migrations SET checksum = ? WHERE name = ?", [rows[0].checksum, rows[0].name]); await migrator.end() }
    expect((await databaseStatus()).schemaVerified).toBe(true)
  })
  it("rejects a missing physical table even with a complete migration ledger", async () => {
    await closeDatabase()
    const migrator = await connect(config.migratorUrl)
    let moved = false
    try {
      await migrator.query("RENAME TABLE media TO runtime_hidden_media")
      moved = true
      await expect(databaseStatus()).rejects.toMatchObject({ code: "unavailable", details: { check: "schema" } })
    } finally { if (moved) await migrator.query("RENAME TABLE runtime_hidden_media TO media"); await migrator.end(); await closeDatabase() }
    expect((await databaseStatus()).schemaVerified).toBe(true)
  })
  it("refuses an incomplete order-search backfill and recovers after indexing", async () => {
    const storeId = uuidv7(), orderId = uuidv7(), worker = systemActor(storeId, "migration")
    const db = await database()
    await db.insert(stores).values({ id: storeId, name: "Backfill readiness drill" })
    try {
      await db.insert(orders).values({ id: orderId, storeId, number: "READINESS-" + orderId, email: "readiness@example.test", phone: "03001234567", status: "confirmed", currency: "PKR", subtotal: 100, total: 100, taxIncluded: 1, shippingAddress: { fullName: "Readiness drill" }, shippingMethod: {}, paymentMethod: "cod", idempotencyKey: orderId, accessTokenHash: "0".repeat(64) })
      await closeDatabase()
      await expect(databaseStatus()).rejects.toMatchObject({ code: "unavailable", details: { check: "schema" } })
      await withTransaction((connection) => syncOrderSearch(connection, worker, orderId))
      expect((await databaseStatus()).schemaVerified).toBe(true)
    } finally {
      const cleanup = await database()
      await cleanup.delete(orders).where(eq(orders.id, orderId))
      await cleanup.delete(stores).where(eq(stores.id, storeId))
      await closeDatabase()
    }
  })
  it("drains an admitted transaction before closing and rejects new admissions", async () => {
    let entered!: () => void, release!: () => void
    const admitted = new Promise<void>((resolve) => { entered = resolve }), gate = new Promise<void>((resolve) => { release = resolve })
    const held = withTransaction(async (db) => { entered(); await gate; return db.execute(sql`SELECT 3 AS alive`) })
    await admitted
    const closing = closeDatabase()
    await expect(database()).rejects.toMatchObject({ code: "unavailable" })
    release()
    const result = await held
    await closing
    expect(scalar(result)).toBe(3)
    expect((await databaseStatus()).schemaVerified).toBe(true)
  })
  it("maps a refused loopback connection to a controlled unavailable error", async () => {
    await closeDatabase()
    const unavailable = new URL(config.appUrl); unavailable.port = "59999"
    process.env.DATABASE_URL = unavailable.href
    try { await expect(database()).rejects.toMatchObject({ code: "unavailable" }) }
    finally { await closeDatabase(); process.env.DATABASE_URL = config.appUrl }
    expect((await databaseStatus()).schemaVerified).toBe(true)
  })
})
