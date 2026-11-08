import fs from "node:fs/promises"
import { createHash } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { count, eq } from "drizzle-orm"
import { ALL_PERMISSIONS } from "@/server/admin/permissions"
import { systemActor } from "@/server/db/actor"
import { closeDatabase, database, databaseStatus } from "@/server/db/client"
import { importSnapshot } from "@/server/db/import.repository"
import * as schema from "@/server/db/schema"
import { demoFixture, readDemoFixture } from "@/server/fixtures/demo"
import { commerceSeed } from "@/server/fixtures/commerce-seed"
import { contentSeed } from "@/server/fixtures/content-seed"
import { openingStock, products } from "@/server/fixtures/seed"
import { configureConnection, statements } from "../../scripts/database-common.mjs"
import { createConnection } from "mysql2/promise"
import { engines } from "./connections"
import { isolatedDatabase } from "./isolated-database"
import { normalizeDeliverySecrets } from "@/server/platform/normalize-delivery.repository"
import { openDeliveryPayload } from "@/server/platform/private-payload"
import { serverEnv } from "@/lib/env.server"
import { uuidv7 } from "@/server/db/uuid"

it("keeps the explicit isolated QA fixture generated from the reference dataset", async () => {
  expect(await fs.readFile("db/seed/demo.json", "utf8")).toBe(demoFixture())
})
for (const [engine] of engines) describe(engine + " production bootstrap and explicit QA seed", () => {
  let isolated: Awaited<ReturnType<typeof isolatedDatabase>>
  beforeAll(async () => { await closeDatabase(); isolated = await isolatedDatabase(engine); process.env.DATABASE_URL = isolated.appUrl })
  afterAll(async () => { await closeDatabase(); if (isolated) await isolated.remove() })
  it("bootstraps no sample catalogue/promotions, with retail prices, base currency and four disabled flags", async () => {
    const connection = await createConnection(isolated.migratorUrl)
    try {
      await configureConnection(connection)
      for (const statement of statements(await fs.readFile("db/seed/bootstrap.sql", "utf8"))) await connection.query(statement)
      // Repeating bootstrap must preserve merchant configuration and avoid duplicates.
      for (const statement of statements(await fs.readFile("db/seed/bootstrap.sql", "utf8"))) await connection.query(statement)
    } finally { await connection.end() }
    const db = await database()
    expect((await db.select({ count: count() }).from(schema.products))[0].count).toBe(0)
    expect((await db.select({ count: count() }).from(schema.promotions))[0].count).toBe(0)
    expect((await db.select({ count: count() }).from(schema.priceLists))[0].count).toBe(1)
    expect((await db.select().from(schema.exchangeRates))[0].rates).toEqual({ PKR: 1 })
    expect((await db.select().from(schema.featureFlags)).filter((row) => !row.enabled)).toHaveLength(4)
    expect((await databaseStatus()).schemaVerified).toBe(true)
  })
  it("imports every public fixture row, retains card images and replays without changing stock", async () => {
    const source = await fs.readFile("db/seed/demo.json", "utf8"), tables = readDemoFixture(source), digest = createHash("sha256").update(source).digest("hex")
    const actor = systemActor(tables.stores[0].id, "migration", ALL_PERMISSIONS)
    const invalid = structuredClone(tables); invalid.inventory[0].onHand = -1
    await expect(importSnapshot(actor, invalid, "e".repeat(64))).rejects.toMatchObject({ code: "validation" })
    expect(await (await database()).select().from(schema.dataImports)).toEqual([])
    expect((await (await database()).select({ count: count() }).from(schema.products))[0].count).toBe(0)
    const [first, concurrent] = await Promise.all([importSnapshot(actor, tables, digest), importSnapshot(actor, tables, digest)])
    expect(concurrent).toEqual(first)
    expect(await importSnapshot(actor, tables, digest)).toEqual(first)
    const db = await database(), rows = async (table: typeof schema.products | typeof schema.variants | typeof schema.promotions | typeof schema.pages) => (await db.select({ count: count() }).from(table))[0].count
    expect(await rows(schema.products)).toBe(products.length)
    expect(await rows(schema.variants)).toBe(products.reduce((total, product) => total + product.variants.length, 0))
    expect((await db.select().from(schema.inventoryLevels)).filter((row) => row.onHand > 0)).toHaveLength(openingStock.filter((row) => row.onHand > 0).length)
    expect(await rows(schema.promotions)).toBe(commerceSeed.promotions.length)
    expect(await rows(schema.pages)).toBe(contentSeed.pages.length)
    expect((await db.select().from(schema.productImages).where(eq(schema.productImages.role, "card"))).length).toBeGreaterThan(0)
    expect(await db.select().from(schema.staffMembers)).toEqual([])
    await expect(importSnapshot(actor, tables, "f".repeat(64))).rejects.toMatchObject({ code: "conflict" })
  })
  it("seals legacy queued links without changing their meaning, attempts or schedule", async () => {
    const db = await database(), id = uuidv7(), storeId = (await db.select({ id: schema.stores.id }).from(schema.stores))[0].id
    const payload = { email: "fake-test@example.test", token: "fake-test-token", accessToken: "fake-test-order-token" }
    await db.insert(schema.outboxEvents).values({ id, storeId, topic: "auth.link_requested", payload, attempts: 2, availableAt: "2030-01-01 00:00:00.000", createdAt: "2026-01-01 00:00:00.000" })
    const before = (await db.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, id)))[0]
    const actor = systemActor(storeId, "migration", ALL_PERMISSIONS)
    expect((await normalizeDeliverySecrets(actor, null)).changed).toBe(1)
    const after = (await db.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, id)))[0]
    expect(openDeliveryPayload(after.payload as Record<string, unknown>, serverEnv.SESSION_SECRET)).toEqual(payload)
    expect(JSON.stringify(after.payload)).not.toContain("fake-test-token")
    expect(JSON.stringify(after.payload)).not.toContain("fake-test-order-token")
    expect({ ...after, payload: undefined }).toEqual({ ...before, payload: undefined })
    expect((await normalizeDeliverySecrets(actor, null)).changed).toBe(0)
  })
})
