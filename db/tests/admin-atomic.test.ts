import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { serverEnv } from "@/lib/env.server"
import { ALL_PERMISSIONS } from "@/server/admin/permissions"
import type { StaffContext } from "@/server/admin/types"
import { createStaffContent } from "@/server/content/staff"
import { createFixturesContentRepository } from "@/server/content/fixtures.repository"
import { createMysqlContentRepository } from "@/server/content/mysql.repository"
import type { ContentOperations } from "@/server/content/repository"
import { emptyHome } from "@/server/content/home-types"
import { systemActor } from "@/server/db/actor"
import { withActor } from "@/server/db/context"
import { bindActor } from "@/server/db/bind"
import { localService } from "@/server/db/driver"
import { closeDatabase, database } from "@/server/db/client"
import { storefrontContent, stores } from "@/server/db/schema"
import { uuidv7 } from "@/server/db/uuid"
import { db as fixtures, resetFixtures } from "@/server/fixtures/store"
import { afterCommit } from "@/server/shared/commit-effects"
import { engines } from "./connections"

for (const [engine, config] of [["fixtures", null] as const, ...engines] as const) describe(engine + " admin unit of work", () => {
  const storeId = uuidv7(), actor = systemActor(storeId, "migration", ALL_PERMISSIONS), fixture = engine === "fixtures"
  const content = bindActor<ContentOperations>(fixture ? createFixturesContentRepository() : createMysqlContentRepository(), () => actor)
  const driver = serverEnv.DATA_DRIVER, originalStore = serverEnv.STORE_ID
  beforeAll(async () => {
    serverEnv.DATA_DRIVER = fixture ? "fixtures" : "mysql"; serverEnv.STORE_ID = storeId
    if (fixture) { resetFixtures(); fixtures().stores[0].id = storeId }
    else { await closeDatabase(); process.env.DATABASE_URL = config!.appUrl; await (await database()).insert(stores).values({ id: storeId, name: "Admin atomic contract" }) }
  })
  afterAll(async () => {
    serverEnv.DATA_DRIVER = driver; serverEnv.STORE_ID = originalStore
    if (!fixture) { try { const db = await database(); await db.delete(storefrontContent).where(eq(storefrontContent.storeId, storeId)); await db.delete(stores).where(eq(stores.id, storeId)) } finally { await closeDatabase() } }
  })
  it("rolls back banner metadata when audit fails and invalidates only after a successful commit", async () => withActor(actor, async () => {
    const at = new Date().toISOString()
    const staff: StaffContext = { member: { userId: uuidv7(), storeId, email: "content-test@example.test", displayName: "Content", status: "active", totpEnabledAt: at }, session: { id: uuidv7(), aal: 2, mfaAt: at, createdAt: at, expiresAt: new Date(Date.now() + 60_000).toISOString() }, roles: [], permissions: ["content:read", "content:write", "content:publish"], refundLimit: 0 }
    let fail = true, invalidations = 0
    const service = localService(createStaffContent({ content, audit: async () => { if (fail) throw new Error("Simulated content audit failure") }, revalidate: () => afterCommit(() => { invalidations++ }) }), ["saveHome"])
    const before = await content.home(storeId), next = { ...emptyHome, announcement: "Committed banner" }
    const meta = { ip: "127.0.0.1", userAgent: "test", requestId: uuidv7() }
    await expect(service.saveHome(staff, meta, next, before?.updatedAt ?? null)).rejects.toThrow("Simulated content audit failure")
    expect(await content.home(storeId)).toEqual(before)
    expect(invalidations).toBe(0)
    fail = false
    await service.saveHome(staff, meta, next, before?.updatedAt ?? null)
    expect((await content.home(storeId))?.content).toEqual(next)
    expect(invalidations).toBe(1)
    await expect(service.saveHome(staff, meta, { ...next, announcement: "Stale overwrite" }, before?.updatedAt ?? null)).rejects.toMatchObject({ code: "conflict" })
    expect((await content.home(storeId))?.content.announcement).toBe("Committed banner")
    expect(invalidations).toBe(1)
  }))
})
