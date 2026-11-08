import { afterAll, beforeAll, describe, expect, it } from "vitest"
import sharp from "sharp"
import { eq } from "drizzle-orm"
import { ALL_PERMISSIONS } from "@/server/admin/permissions"
import type { MediaOperations } from "@/server/media/repository"
import { createFixturesMediaRepository } from "@/server/media/fixtures.repository"
import { createMysqlMediaRepository } from "@/server/media/mysql.repository"
import { systemActor } from "@/server/db/actor"
import { bindActor } from "@/server/db/bind"
import { closeDatabase, database } from "@/server/db/client"
import { stores } from "@/server/db/schema"
import { uuidv7 } from "@/server/db/uuid"
import { db as fixtures, resetFixtures } from "@/server/fixtures/store"
import { engines } from "./connections"

for (const [engine, config] of [["fixtures", null] as const, ...engines] as const) describe(engine + " media contract", () => {
  const storeId = uuidv7(), actor = systemActor(storeId, "migration", ALL_PERMISSIONS), fixture = engine === "fixtures"
  const media: MediaOperations = fixture ? createFixturesMediaRepository() : bindActor<MediaOperations>(createMysqlMediaRepository(), () => actor)
  beforeAll(async () => {
    if (fixture) { resetFixtures(); fixtures().media = [] }
    else { await closeDatabase(); process.env.DATABASE_URL = config!.appUrl; await (await database()).insert(stores).values({ id: storeId, name: "Media contract" }) }
  })
  afterAll(async () => { if (!fixture) { try { await (await database()).delete(stores).where(eq(stores.id, storeId)) } finally { await closeDatabase() } } })
  it("stores image bytes, pages/searches metadata, replaces alt text and removes the public index", async () => {
    const data = new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).webp().toBuffer())
    const id = uuidv7(), input = { id, storeId, path: storeId + "/" + id + ".webp", filename: "contract.webp", mime: "image/webp" as const, bytes: data.length, width: 8, height: 8, alt: "Contract image", createdBy: null, createdAt: new Date().toISOString() }
    const saved = await media.create(input, data)
    expect(saved.id).toBe(id)
    expect(await media.read(saved.path)).toEqual(data)
    expect(await media.find(storeId, id)).toEqual(saved)
    expect(await media.findById(id)).toEqual(saved)
    expect((await media.list(storeId, { q: "contract", page: 1, pageSize: 1 })).items).toEqual([saved])
    expect((await media.updateAlt(storeId, id, "Updated alt")).alt).toBe("Updated alt")
    // A second upload of identical bytes remains a separate editable library item.
    const second = await media.create({ ...input, id: uuidv7(), path: storeId + "/" + uuidv7() + ".webp" }, data)
    expect(second.id).not.toBe(id)
    expect((await media.list(storeId, { page: 1, pageSize: 1 })).total).toBe(2)
    expect(await media.hasOrderUsage(storeId, "/media/" + id + ".webp")).toBe(false)
    await media.remove(storeId, id)
    expect(await media.findById(id)).toBeNull()
    expect(await media.read(saved.path)).toBeNull()
    await media.remove(storeId, second.id)
  })
})
