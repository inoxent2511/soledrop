import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { eq, sql } from "drizzle-orm"
import { closeDatabase, database, withTransaction } from "@/server/db/client"
import { rateLimits } from "@/server/db/schema"
import { uuidv7 } from "@/server/db/uuid"
import { DomainError } from "@/server/shared/errors"
import { connect, engines } from "./connections"

for (const [engine, configuration] of engines) describe(engine + " transaction failure drills", () => {
  const keys = ["failure-a:" + uuidv7(), "failure-b:" + uuidv7()]
  beforeAll(async () => {
    await closeDatabase(); process.env.DATABASE_URL = configuration.appUrl
    const db = await database()
    for (const key of keys) await db.insert(rateLimits).values({ key, count: 0, windowStart: "2000-01-01 00:00:00.000" })
  })
  afterAll(async () => {
    try { const db = await database(); for (const key of keys) await db.delete(rateLimits).where(eq(rateLimits.key, key)) } finally { await closeDatabase() }
  })

  it("rejects retry configuration without an explicit idempotency key", async () => {
    await expect(withTransaction(async () => true, { retries: 1 })).rejects.toThrow("idempotency key")
    await expect(withTransaction(async () => true, { retries: 4, idempotencyKey: "test" })).rejects.toThrow("bound")
  })

  it("rolls back business failures and never retries them", async () => {
    let attempts = 0
    await expect(withTransaction(async (db) => {
      attempts++
      await db.update(rateLimits).set({ count: 123 }).where(eq(rateLimits.key, keys[0]))
      throw new DomainError("validation", "Deliberate rollback")
    }, { retries: 3, idempotencyKey: "business-failure" })).rejects.toMatchObject({ code: "validation" })
    expect(attempts).toBe(1)
    expect((await (await database()).select().from(rateLimits).where(eq(rateLimits.key, keys[0])))[0].count).toBe(0)
  })

  it("retries a real two-connection deadlock with bounded attempts and no duplicate increments", async () => {
    let reached = 0, release: () => void = () => undefined
    const barrier = new Promise<void>((resolve) => { release = resolve }), attempts = [0, 0]
    const increment = sql.fromList([rateLimits.count, sql.raw(" + 1")])
    await Promise.all([0, 1].map((index) => withTransaction(async (db) => {
      attempts[index]++
      await db.update(rateLimits).set({ count: increment }).where(eq(rateLimits.key, keys[index]))
      if (attempts[index] === 1) { if (++reached === 2) release(); await barrier }
      await db.update(rateLimits).set({ count: increment }).where(eq(rateLimits.key, keys[1 - index]))
    }, { retries: 3, idempotencyKey: "deadlock-worker:" + index })))
    expect(attempts.reduce((sum, value) => sum + value, 0)).toBeGreaterThanOrEqual(3)
    expect(attempts.every((value) => value <= 4)).toBe(true)
    const db = await database()
    for (const key of keys) expect((await db.select().from(rateLimits).where(eq(rateLimits.key, key)))[0].count).toBe(2)
  })

  it("retries a real lock-wait timeout after rollback and restores connection settings", async () => {
    const blocker = await connect(configuration.appUrl)
    await blocker.beginTransaction()
    await blocker.execute("UPDATE rate_limits SET count = count WHERE `key` = ?", [keys[0]])
    let attempts = 0
    try {
      await withTransaction(async (db) => {
        attempts++
        await db.execute(sql.raw("SET SESSION innodb_lock_wait_timeout = 1"))
        try { await db.update(rateLimits).set({ count: 3 }).where(eq(rateLimits.key, keys[0])) }
        catch (error) { await blocker.commit(); throw error }
        finally { await db.execute(sql.raw("SET SESSION innodb_lock_wait_timeout = 50")) }
      }, { retries: 1, idempotencyKey: "lock-timeout" })
      expect(attempts).toBe(2)
      expect((await (await database()).select().from(rateLimits).where(eq(rateLimits.key, keys[0])))[0].count).toBe(3)
    } finally { await blocker.rollback(); await blocker.end() }
  })
})
