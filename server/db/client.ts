import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"
import { randomInt } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import mysql from "mysql2"
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise"
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2"
import { getTableColumns, is } from "drizzle-orm"
import { getTableConfig, MySqlTable } from "drizzle-orm/mysql-core"
import { DomainError } from "@/server/shared/errors"
import * as schema from "./schema"
import { supportedEngine } from "../../scripts/database-engine.mjs"
import { expectedMigrations } from "./migration-manifest"

export type Database = MySql2Database<typeof schema>
type Engine = { engine: "mysql" | "mariadb"; version: string }
type Limits = { acquire: number; query: number; transaction: number }
type Activity = { active: number; closing: boolean; waiters: Set<() => void> }
type State = { pool: Pool; client: Pool; db: Database; ready: Promise<Engine>; engine?: Engine; limits: Limits; activity: Activity; connections: Set<{ destroy(): void }>; schemaCheckedAt?: number }
const transaction = new AsyncLocalStorage<Database>()
const sessionInitializers = new WeakMap<Pool, Map<number, Promise<void>>>()
const globals = globalThis as typeof globalThis & { __soledropMysql?: State; __soledropMysqlShutdown?: boolean }

function milliseconds(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value < 100 || value > 120_000) throw new Error("Invalid database deadline configuration")
  return value
}

/** Destroy a timed-out socket: releasing a still-running query would corrupt the next borrower. */
async function deadline<T>(connection: PoolConnection, operation: () => Promise<T>, timeout: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { connection.destroy(); reject(new DomainError("unavailable", "The store is busy. Please try again.")) }, timeout)
    })])
  } catch (error) {
    const cause = driverError(error)
    if (cause && typeof cause === "object" && "errno" in cause && [1317, 1969, 3024].includes(Number(cause.errno))) connection.destroy()
    throw error
  } finally { clearTimeout(timer) }
}

function boundedConnection(connection: PoolConnection, timeout: number): PoolConnection {
  return new Proxy(connection, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property)
      if (typeof value !== "function") return value
      if (["query", "execute", "beginTransaction", "commit", "rollback", "ping"].includes(String(property))) return (...args: unknown[]) => deadline(target, () => Reflect.apply(value, target, args), timeout)
      return value.bind(target)
    },
  })
}

function admit(activity: Activity): () => void {
  if (activity.closing) throw new DomainError("unavailable", "The store is restarting. Please try again.")
  activity.active++
  return () => { if (--activity.active === 0) { for (const resolve of activity.waiters) resolve(); activity.waiters.clear() } }
}

function boundedPool(pool: Pool, limits: Limits, activity: Activity): Pool {
  return new Proxy(pool, {
    get(target, property) {
      if (property === "getConnection") return async () => boundedConnection(await acquire(target, limits.acquire), limits.query)
      const value: unknown = Reflect.get(target, property)
      if (typeof value !== "function") return value
      if (property === "query" || property === "execute") return async (...args: unknown[]) => {
        const leave = admit(activity)
        let connection: PoolConnection | undefined
        try {
          connection = await acquire(target, limits.acquire)
          const operation = Reflect.get(connection, property)
          return await deadline(connection, () => Reflect.apply(operation, connection!, args), limits.query)
        } catch (error) { throw databaseError(error) }
        finally { connection?.release(); leave() }
      }
      return value.bind(target)
    },
  })
}

function state(): State {
  if (globals.__soledropMysqlShutdown || globals.__soledropMysql?.activity.closing) throw new DomainError("unavailable", "The store is restarting. Please try again.")
  if (globals.__soledropMysql) return globals.__soledropMysql
  const uri = process.env.DATABASE_URL
  if (!uri) throw new Error("DATABASE_URL is required for the mysql driver")
  const limit = Number(process.env.DATABASE_POOL_MAX ?? "5")
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Invalid DATABASE_POOL_MAX")
  const limits = { acquire: milliseconds("DATABASE_ACQUIRE_TIMEOUT_MS", 10_000), query: milliseconds("DATABASE_QUERY_TIMEOUT_MS", 10_000), transaction: milliseconds("DATABASE_TRANSACTION_TIMEOUT_MS", 30_000) }
  const connections = new Set<{ destroy(): void }>()
  const raw = mysql.createPool({
    uri, connectionLimit: limit, maxIdle: limit, idleTimeout: 30_000,
    waitForConnections: true, queueLimit: 200, connectTimeout: 10_000,
    enableKeepAlive: true, keepAliveInitialDelay: 0, timezone: "Z", dateStrings: true,
    supportBigNumbers: true, bigNumberStrings: true, decimalNumbers: false,
    charset: "utf8mb4_unicode_ci", multipleStatements: false,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  })
  const initializers = new Map<number, Promise<void>>()
  // Admission awaits session setup; async engine detection must finish before the first query.
  raw.on("connection", (connection) => {
    connections.add(connection)
    connection.once("end", () => { connections.delete(connection); initializers.delete(connection.threadId) })
    const initialized = (async () => {
      const session = connection.promise()
      await session.query("SET SESSION time_zone = '+00:00'")
      await session.query("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'")
      await session.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ")
      const [[identity]] = await session.query<RowDataPacket[]>("SELECT VERSION() AS version, @@version_comment AS comment")
      const engine = supportedEngine(String(identity.version), String(identity.comment))
      // Keep the client deadline first; the engine also cancels work abandoned with its socket.
      const serverDeadline = limits.query + 250
      if (engine.engine === "mariadb") await session.query("SET SESSION max_statement_time = ?", [serverDeadline / 1000])
      else await session.query("SET SESSION max_execution_time = ?", [serverDeadline])
      await session.query("SET SESSION innodb_lock_wait_timeout = ?", [Math.max(1, Math.ceil(serverDeadline / 1000))])
    })()
    initializers.set(connection.threadId, initialized)
    // A handshake may finish after its waiting borrower expires. Admission still observes errors.
    void initialized.catch(() => undefined)
  })
  const pool = raw.promise()
  sessionInitializers.set(pool, initializers)
  const activity: Activity = { active: 0, closing: false, waiters: new Set() }
  const client = boundedPool(pool, limits, activity)
  const db = drizzle({ client, schema, mode: "default" })
  const ready = client.query<RowDataPacket[]>("SELECT VERSION() AS version, @@version_comment AS comment").then(([rows]) => {
    const engine = supportedEngine(String(rows[0].version), String(rows[0].comment)) as Engine
    if (globals.__soledropMysql?.pool === pool) globals.__soledropMysql.engine = engine
    return engine
  })
  globals.__soledropMysql = { pool, client, db, ready, limits, activity, connections }
  return globals.__soledropMysql
}

export function databaseError(error: unknown): Error {
  if (error instanceof DomainError) return error
  const cause = driverError(error)
  if (cause instanceof DomainError) return cause
  const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : ""
  const errno = cause && typeof cause === "object" && "errno" in cause ? Number(cause.errno) : 0
  if (["ER_DUP_ENTRY", "ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(code)) return new DomainError("conflict", "This record changed. Please try again.")
  if (["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "PROTOCOL_CONNECTION_LOST", "PROTOCOL_SEQUENCE_TIMEOUT", "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR", "ER_CON_COUNT_ERROR", "ER_USER_LIMIT_REACHED", "ER_QUERY_INTERRUPTED", "ER_QUERY_TIMEOUT", "ER_STATEMENT_TIMEOUT"].includes(code) || [1317, 1969, 3024].includes(errno) || cause instanceof Error && /Queue limit reached|Pool is closed|closed state/i.test(cause.message)) {
    console.warn(JSON.stringify({ level: "warn", event: "database_unavailable", code: /^[A-Z0-9_]+$/.test(code) ? code : "pool_unavailable", ...(errno ? { errno } : {}) }))
    return new DomainError("unavailable", "The store is temporarily unavailable. Please try again.")
  }
  if (["ER_CHECK_CONSTRAINT_VIOLATED", "ER_CONSTRAINT_FAILED", "ER_NO_REFERENCED_ROW_2", "ER_ROW_IS_REFERENCED_2"].includes(code) || errno === 4025 && globals.__soledropMysql?.engine?.engine === "mariadb") return new DomainError("validation", "This record conflicts with the store's data rules.")
  // Drizzle errors include SQL and bound parameters in their message. Never send those to
  // instrumentation/logs or clients when a driver/schema failure reaches a repository boundary.
  if (code || error instanceof Error && "query" in error) {
    const denied = cause instanceof Error ? cause.message.match(/^(SELECT|INSERT|UPDATE|DELETE) command denied[\s\S]*for table ['`]([a-z_]+)['`]/i) : null
    console.error(JSON.stringify({ level: "error", event: "database_failure", code: code || "query_failed", ...(denied ? { operation: denied[1], table: denied[2] } : {}) }))
    return new DomainError("unavailable", "The store is temporarily unavailable. Please try again.")
  }
  return error instanceof Error ? error : new Error("Database request failed")
}

function driverError(error: unknown): unknown {
  let current = error
  for (let depth = 0; depth < 5 && current instanceof Error && current.cause; depth++) current = current.cause
  return current
}

export function inDatabaseTransaction(): boolean { return Boolean(transaction.getStore()) }

export async function database(): Promise<Database> {
  const current = transaction.getStore()
  if (current) return current
  const currentState = state()
  await currentState.ready.catch((error: unknown) => { throw databaseError(error) })
  return currentState.db
}

async function acquire(pool: Pool, timeout: number): Promise<PoolConnection> {
  let expired = false
  let admitted: PoolConnection | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const connection = pool.getConnection().then(async (value) => {
    if (expired) { value.release(); throw new DomainError("unavailable", "The store is busy. Please try again.") }
    admitted = value
    try { await sessionInitializers.get(pool)?.get(value.threadId) }
    catch (error) { value.destroy(); throw error }
    if (expired) { value.destroy(); throw new DomainError("unavailable", "The store is busy. Please try again.") }
    return value
  })
  try {
    return await Promise.race([connection, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { expired = true; admitted?.destroy(); reject(new DomainError("unavailable", "The store is busy. Please try again.")) }, timeout)
    })])
  } finally { clearTimeout(timer) }
}

/** External effects stay outside the callback. Retrying writes requires an idempotency key. */
export async function withTransaction<T>(fn: (db: Database) => Promise<T>, options: { retries?: number; idempotencyKey?: string } = {}): Promise<T> {
  const current = transaction.getStore()
  if (current) return fn(current)
  const retries = options.retries ?? 0
  if (!Number.isInteger(retries) || retries < 0 || retries > 3 || retries > 0 && !options.idempotencyKey) throw new TypeError("Retries require an idempotency key and a bound of 0–3")
  const currentState = state()
  await currentState.ready.catch((error: unknown) => { throw databaseError(error) })
  const leave = admit(currentState.activity)
  try {
  for (let attempt = 0; ; attempt++) {
    const connection = boundedConnection(await acquire(currentState.pool, currentState.limits.acquire).catch((error: unknown) => { throw databaseError(error) }), currentState.limits.query)
    try {
      await connection.beginTransaction()
      const db = drizzle({ client: connection, schema, mode: "default" })
      const result = await deadline(connection, () => transaction.run(db, () => fn(db)), currentState.limits.transaction)
      await connection.commit()
      return result
    } catch (error) {
      await connection.rollback().catch(() => undefined)
      const cause = driverError(error)
      const errno = cause && typeof cause === "object" && "errno" in cause ? Number(cause.errno) : 0
      if (attempt >= retries || ![1205, 1213].includes(errno)) throw databaseError(error)
    } finally { connection.release() }
    await delay(randomInt(10, 50) * (attempt + 1))
  }
  } finally { leave() }
}

export async function databaseStatus() {
  const current = state()
  const engine = await current.ready
  const [rows] = await current.client.query<RowDataPacket[]>("SELECT name, checksum FROM schema_migrations ORDER BY name")
  if (rows.length !== expectedMigrations.length || expectedMigrations.some((expected, index) => rows[index]?.name !== expected.name || rows[index]?.checksum !== expected.checksum)) throw new DomainError("unavailable", "Database migrations do not match this application release.", { check: "schema" })
  if (!current.schemaCheckedAt || Date.now() - current.schemaCheckedAt >= 30_000) {
    const [columns] = await current.client.query<RowDataPacket[]>("SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE()")
    const present = new Set(columns.map((row) => String(row.tableName) + "." + String(row.columnName)))
    for (const table of Object.values(schema).filter((value) => is(value, MySqlTable))) {
      const name = getTableConfig(table).name
      if (Object.values(getTableColumns(table)).some((column) => !present.has(name + "." + column.name))) throw new DomainError("unavailable", "The physical database schema is incomplete.", { check: "schema" })
    }
    const [missingSearch] = await current.client.query<RowDataPacket[]>("SELECT 1 FROM orders o LEFT JOIN order_search_documents d ON d.order_id=o.id AND d.store_id=o.store_id WHERE d.order_id IS NULL OR d.search_version<1 LIMIT 1")
    if (missingSearch.length) throw new DomainError("unavailable", "Order search backfill is incomplete. Run the release order reindex before starting the application.", { check: "schema" })
    current.schemaCheckedAt = Date.now()
  }
  return { ...engine, migration: rows.at(-1)?.name ?? null, schemaVerified: true, poolMax: Number(process.env.DATABASE_POOL_MAX ?? "5") }
}

export async function closeDatabase(): Promise<void> {
  const current = globals.__soledropMysql
  if (!current) return
  current.activity.closing = true
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const drain = async () => {
      if (current.activity.active) await new Promise<void>((resolve) => { current.activity.waiters.add(resolve) })
      await current.pool.end()
    }
    await Promise.race([drain(), new Promise<void>((resolve) => {
      timer = setTimeout(() => { for (const connection of current.connections) connection.destroy(); void current.pool.end().catch(() => undefined); resolve() }, current.limits.transaction + 1000)
    })])
  } finally { clearTimeout(timer); if (globals.__soledropMysql === current) delete globals.__soledropMysql }
}

/** Next manages its HTTP listener; this prevents new DB admissions and drains/ends its pool. */
export function installDatabaseShutdown(): void {
  const stop = () => { globals.__soledropMysqlShutdown = true; void closeDatabase().catch(() => undefined) }
  process.once("SIGTERM", stop)
  process.once("SIGINT", stop)
}
