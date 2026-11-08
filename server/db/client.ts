import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"
import { randomInt } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import mysql from "mysql2"
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise"
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2"
import { DomainError } from "@/server/shared/errors"
import * as schema from "./schema"
import { supportedEngine } from "../../scripts/database-engine.mjs"

export type Database = MySql2Database<typeof schema>
type Engine = { engine: "mysql" | "mariadb"; version: string }
type State = { pool: Pool; db: Database; ready: Promise<Engine> }
const transaction = new AsyncLocalStorage<Database>()
const globals = globalThis as typeof globalThis & { __soledropMysql?: State }

function state(): State {
  if (globals.__soledropMysql) return globals.__soledropMysql
  const uri = process.env.DATABASE_URL
  if (!uri) throw new Error("DATABASE_URL is required for the mysql driver")
  const limit = Number(process.env.DATABASE_POOL_MAX ?? "5")
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Invalid DATABASE_POOL_MAX")
  const raw = mysql.createPool({
    uri, connectionLimit: limit, maxIdle: limit, idleTimeout: 30_000,
    waitForConnections: true, queueLimit: 200, connectTimeout: 10_000,
    enableKeepAlive: true, keepAliveInitialDelay: 0, timezone: "Z", dateStrings: true,
    supportBigNumbers: true, bigNumberStrings: true, decimalNumbers: false,
    charset: "utf8mb4_unicode_ci", multipleStatements: false,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  })
  // Queue session setup before mysql2 hands a newly established connection to a query.
  raw.on("connection", (connection) => {
    connection.query("SET SESSION time_zone = '+00:00'")
    connection.query("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'")
    connection.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ")
  })
  const pool = raw.promise()
  const db = drizzle({ client: pool, schema, mode: "default" })
  const ready = pool.query<RowDataPacket[]>("SELECT VERSION() AS version, @@version_comment AS comment").then(([rows]) => {
    return supportedEngine(String(rows[0].version), String(rows[0].comment)) as Engine
  })
  globals.__soledropMysql = { pool, db, ready }
  return globals.__soledropMysql
}

export function databaseError(error: unknown): Error {
  if (error instanceof DomainError) return error
  const cause = driverError(error)
  const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : ""
  if (["ER_DUP_ENTRY", "ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(code)) return new DomainError("conflict", "This record changed. Please try again.")
  if (["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "PROTOCOL_CONNECTION_LOST", "ER_CON_COUNT_ERROR", "ER_USER_LIMIT_REACHED"].includes(code)) return new DomainError("unavailable", "The store is temporarily unavailable. Please try again.")
  return error instanceof Error ? error : new Error("Database request failed")
}

function driverError(error: unknown): unknown {
  let current = error
  for (let depth = 0; depth < 5 && current instanceof Error && current.cause; depth++) current = current.cause
  return current
}

export async function database(): Promise<Database> {
  const current = transaction.getStore()
  if (current) return current
  const currentState = state()
  await currentState.ready.catch((error: unknown) => { throw databaseError(error) })
  return currentState.db
}

async function acquire(pool: Pool): Promise<PoolConnection> {
  let expired = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const connection = pool.getConnection().then((value) => {
    if (expired) { value.release(); throw new DomainError("unavailable", "The store is busy. Please try again.") }
    return value
  })
  try {
    return await Promise.race([connection, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { expired = true; reject(new DomainError("unavailable", "The store is busy. Please try again.")) }, 10_000)
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
  await currentState.ready
  for (let attempt = 0; ; attempt++) {
    const connection = await acquire(currentState.pool)
    try {
      await connection.beginTransaction()
      const db = drizzle({ client: connection, schema, mode: "default" })
      const result = await transaction.run(db, () => fn(db))
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
}

export async function databaseStatus() {
  const current = state()
  const engine = await current.ready
  const [rows] = await current.pool.query<RowDataPacket[]>("SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1")
  return { ...engine, migration: rows[0]?.name ?? null, poolMax: Number(process.env.DATABASE_POOL_MAX ?? "5") }
}

export async function closeDatabase(): Promise<void> {
  const current = globals.__soledropMysql
  delete globals.__soledropMysql
  if (current) await current.pool.end()
}
