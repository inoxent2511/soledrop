import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { eq, sql } from "drizzle-orm"
import { stores } from "@/server/db/schema"
import { uuidv7 } from "@/server/db/uuid"
import { engines } from "./connections"

for (const [engine, config] of engines) describe(engine + " separately loaded transaction graphs", () => {
  const id = uuidv7()
  let first: typeof import("@/server/db/client"), second: typeof import("@/server/db/client")
  beforeAll(async () => {
    first = await import("@/server/db/client")
    await first.closeDatabase()
    process.env.DATABASE_URL = config.appUrl
    await (await first.database()).insert(stores).values({ id, name: "Bundle context reference" })
    vi.resetModules()
    second = await import("@/server/db/client")
  })
  afterAll(async () => {
    await (await first.database()).delete(stores).where(eq(stores.id, id))
    await first.closeDatabase()
  })
  it("reuses the admitted connection and rolls back nested work across module graphs", async () => {
    expect(first.withTransaction).not.toBe(second.withTransaction)
    await expect(first.withTransaction(async db => {
      await db.select().from(stores).where(eq(stores.id, id)).for("update")
      expect(second.inDatabaseTransaction()).toBe(true)
      expect(await second.database()).toBe(db)
      await second.withTransaction(async nested => {
        expect(nested).toBe(db)
        await nested.update(stores).set({ name: "Must roll back" }).where(eq(stores.id, id))
      })
      throw Error("Roll back both module graphs")
    })).rejects.toThrow("Roll back both module graphs")
    expect((await (await second.database()).select().from(stores).where(eq(stores.id, id)))[0].name).toBe("Bundle context reference")
    expect(second.inDatabaseTransaction()).toBe(false)
  })
  it("keeps concurrent connections separate and awaits shared session initialization", async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve }), connections = new Set<unknown>()
    const work = Array.from({ length: 5 }, (_, index) => (index % 2 ? first : second).withTransaction(async db => {
      expect(await first.database()).toBe(db)
      expect(await second.database()).toBe(db)
      const result = await db.execute(sql`SELECT @@time_zone AS zone, @@sql_mode AS mode`)
      const row = (result[0] as unknown as { zone: string; mode: string }[])[0]
      expect(row.zone).toBe("+00:00")
      expect(row.mode).toContain("STRICT_TRANS_TABLES")
      connections.add(db)
      await gate
      expect(await second.database()).toBe(db)
    }))
    try { await expect.poll(() => connections.size).toBe(5) }
    finally { release(); await Promise.all(work) }
    expect(first.inDatabaseTransaction()).toBe(false)
  })
})
