import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { ALL_PERMISSIONS, PERMISSIONS, PRESET_ROLES } from "@/server/admin/permissions"
import { hashToken, newToken } from "@/server/admin/crypto"
import { createMysqlAdminRepository } from "@/server/admin/mysql.repository"
import { createMysqlCatalogRepository } from "@/server/catalog/mysql.repository"
import { createMysqlMediaRepository } from "@/server/media/mysql.repository"
import { createMysqlPlatformRepository } from "@/server/platform/mysql.repository"
import { createMysqlContentRepository } from "@/server/content/mysql.repository"
import { createMysqlCustomerRepository } from "@/server/customers/mysql.repository"
import { createMysqlInventoryRepository } from "@/server/inventory/mysql.repository"
import { createMysqlOrderRepository } from "@/server/orders/mysql.repository"
import { createMysqlPromotionRepository } from "@/server/promotions/mysql.repository"
import { createMysqlSearchRepository } from "@/server/search/mysql.repository"
import { createMysqlCartRepository } from "@/server/cart/mysql.repository"
import type { Permission } from "@/server/admin/permissions"
import { currentStaffActor } from "@/server/db/policy.repository"
import { anonymousActor, systemActor, type Actor } from "@/server/db/actor"
import { closeDatabase, database, withTransaction } from "@/server/db/client"
import { stores } from "@/server/db/schema"
import { uuidv7, uuidToBytes } from "@/server/db/uuid"
import { connect, engines } from "./connections"

for (const [engine, config] of engines) describe(engine + " live repository authorization", () => {
  const storeId = uuidv7(), admin = createMysqlAdminRepository(), catalog = createMysqlCatalogRepository(), media = createMysqlMediaRepository(), platform = createMysqlPlatformRepository()
  const auth = systemActor(storeId, "auth:staff", ALL_PERMISSIONS), worker = systemActor(storeId, "migration", ALL_PERMISSIONS)
  const ownerId = uuidv7(), memberId = uuidv7(), at = new Date().toISOString()
  let sessionId = ""
  const actor = (): Extract<Actor, { kind: "staff" }> => ({ kind: "staff", storeId, id: memberId, sessionId, permissions: ALL_PERMISSIONS, roleKeys: ["owner", "admin"], refundLimit: null, mfaVerifiedAt: new Date().toISOString() })
  const createSession = async (userId: string, options: { createdAt?: string; lastSeenAt?: string; mfaAt?: string } = {}) => {
    const id = uuidv7()
    await admin.createSession(auth, { id, userId, storeId, tokenHash: hashToken(newToken()), aal: 2, mfaAt: options.mfaAt ?? at, createdAt: options.createdAt ?? at, lastSeenAt: options.lastSeenAt ?? at, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), ip: null, userAgent: null, revokedAt: null })
    return id
  }
  const reset = async (role = "admin") => {
    await admin.updateMember(auth, storeId, memberId, { status: "active", totpEnabledAt: at, totpSecret: "sealed-test-factor" })
    await admin.setRoles(auth, storeId, memberId, [role])
    sessionId = await createSession(memberId)
  }
  beforeAll(async () => {
    await closeDatabase(); process.env.DATABASE_URL = config.appUrl
    await (await database()).insert(stores).values({ id: storeId, name: "Live authorization contract" })
    await admin.syncRegistry(auth, storeId, ALL_PERMISSIONS.map((key) => ({ key, label: PERMISSIONS[key].label, group: PERMISSIONS[key].group, sensitive: false })), PRESET_ROLES)
    for (const id of [ownerId, memberId]) await admin.createMember(auth, { userId: id, storeId, email: id + "@example.test", displayName: "Authorization member", status: "active", passwordHash: null, totpSecret: "sealed-test-factor", totpEnabledAt: at, totpLastStep: null, recoveryCodes: [], failedLogins: 0, lockedUntil: null, lastSeenAt: null, createdAt: at, updatedAt: at })
    await admin.setRoles(auth, storeId, ownerId, ["owner"])
    await reset()
  })
  afterAll(async () => {
    const cleanup = await connect(config.migratorUrl)
    try { const id = uuidToBytes(storeId); await cleanup.execute("DELETE FROM staff_roles WHERE store_id = ?", [id]); await cleanup.execute("DELETE FROM stores WHERE id = ?", [id]) }
    finally { await cleanup.end(); await closeDatabase() }
  })

  it("allows a live member's actual grants and rejects missing, fabricated and cross-store sessions", async () => {
    expect(await catalog.searchProducts(actor(), storeId, { page: 1, pageSize: 10 })).toEqual({ products: [], total: 0 })
    await expect(media.list({ ...actor(), sessionId: uuidv7() }, storeId, { page: 1, pageSize: 10 })).rejects.toMatchObject({ code: "unauthorized" })
    await expect(media.list({ ...actor(), storeId: uuidv7() }, storeId, { page: 1, pageSize: 10 })).rejects.toMatchObject({ code: "forbidden" })
    await expect(media.list(undefined as unknown as Actor, storeId, { page: 1, pageSize: 10 })).rejects.toMatchObject({ code: "forbidden" })
    await expect(media.list(anonymousActor(storeId), storeId, { page: 1, pageSize: 10 })).rejects.toMatchObject({ code: "forbidden" })
  })

  it("rejects an old actor immediately after session revocation or suspension", async () => {
    const old = actor()
    await admin.revokeSessions(auth, storeId, memberId)
    await expect(catalog.listBrands(old, storeId)).rejects.toMatchObject({ code: "unauthorized" })
    await reset()
    const prior = actor()
    await admin.updateMember(auth, storeId, memberId, { status: "suspended" })
    await expect(catalog.listBrands(prior, storeId)).rejects.toMatchObject({ code: "unauthorized" })
    await reset()
  })

  it("revokes sessions on role edits and rejects inflated grants on a new live session", async () => {
    const stale = actor(), role = await admin.findRole(auth, storeId, "admin")
    const custom = { ...role!, id: uuidv7(), key: "revocable", name: "Revocable", isSystem: false }
    await admin.createRole(auth, custom)
    await admin.setRoles(auth, storeId, memberId, [custom.key])
    sessionId = await createSession(memberId)
    const granted = { ...stale, sessionId }
    expect((await media.list(granted, storeId, { page: 1, pageSize: 10 })).total).toBe(0)
    await admin.updateRole(auth, storeId, custom.key, { permissions: [] })
    await expect(media.list(granted, storeId, { page: 1, pageSize: 10 })).rejects.toMatchObject({ code: "unauthorized" })
    sessionId = await createSession(memberId)
    await expect(media.list({ ...granted, sessionId }, storeId, { page: 1, pageSize: 10 })).rejects.toMatchObject({ code: "forbidden" })
    await reset()
  })

  it("attenuates forged Owner keys, refund ceilings and MFA freshness to stored authority", async () => {
    await reset("support_agent")
    const effective = await withTransaction((db) => currentStaffActor(db, actor()))
    expect(effective).toMatchObject({ permissions: expect.not.arrayContaining(["roles:manage"]), roleKeys: [], refundLimit: 500_000, mfaVerifiedAt: at })
    await reset()
  })

  it("prevents Admin from demoting, suspending or resetting an Owner at the raw boundary", async () => {
    await expect(admin.setRoles(actor(), storeId, ownerId, ["read_only"])).rejects.toMatchObject({ code: "forbidden" })
    await expect(admin.updateMember(actor(), storeId, ownerId, { status: "suspended" })).rejects.toMatchObject({ code: "forbidden" })
    await expect(admin.updateMember(actor(), storeId, ownerId, { totpSecret: null, totpEnabledAt: null })).rejects.toMatchObject({ code: "forbidden" })
    await expect(admin.updateMember(actor(), storeId, ownerId, { passwordHash: "replacement" })).rejects.toMatchObject({ code: "forbidden" })
  })

  it("rejects idle/absolute expiry and proof timestamps that were not accepted by the session", async () => {
    const idle = await createSession(memberId, { lastSeenAt: new Date(Date.now() - 1_800_001).toISOString() })
    await expect(catalog.listBrands({ ...actor(), sessionId: idle }, storeId)).rejects.toMatchObject({ code: "unauthorized" })
    const absolute = await createSession(memberId, { createdAt: new Date(Date.now() - 43_200_001).toISOString() })
    await expect(catalog.listBrands({ ...actor(), sessionId: absolute }, storeId)).rejects.toMatchObject({ code: "unauthorized" })
    const future = await createSession(memberId, { mfaAt: new Date(Date.now() + 60_000).toISOString() })
    await expect(catalog.listBrands({ ...actor(), sessionId: future }, storeId)).rejects.toMatchObject({ code: "unauthorized" })
  })

  it("keeps a self-revoking write and its required audit in one admitted transaction", async () => {
    const current = actor()
    await withTransaction(async () => {
      await admin.revokeSessions(current, storeId, memberId)
      await platform.audit(current, { storeId, actor: memberId, action: "staff.signed_out_everywhere", entity: "staff", entityId: memberId, before: null, after: null })
      await expect(media.list({ ...current, permissions: [] }, storeId, { page: 1, pageSize: 10 })).rejects.toMatchObject({ code: "forbidden" })
    })
    await expect(media.list(current, storeId, { page: 1, pageSize: 10 })).rejects.toMatchObject({ code: "unauthorized" })
    expect(await platform.listAudit(worker, "staff", memberId)).toEqual(expect.arrayContaining([expect.objectContaining({ action: "staff.signed_out_everywhere" })]))
    await reset()
  })

  const reads: { permission: Permission; label: string; run: (actor: Actor) => Promise<unknown> }[] = [
    { permission: "products:read", label: "catalogue", run: (a) => catalog.searchProducts(a, storeId, { page: 1, pageSize: 10 }) },
    { permission: "reports:read", label: "report catalogue", run: (a) => catalog.reportProducts(a, storeId, 1) },
    { permission: "collections:read", label: "collection contents", run: (a) => catalog.collectionProductIds(a, storeId, uuidv7()) },
    { permission: "staff:read", label: "members", run: (a) => admin.listMembers(a, storeId) },
    { permission: "staff:read", label: "roles", run: (a) => admin.listRoles(a, storeId) },
    { permission: "media:read", label: "media", run: (a) => media.list(a, storeId, { page: 1, pageSize: 10 }) },
    { permission: "content:read", label: "draft pages", run: (a) => createMysqlContentRepository().staffPages(a, storeId) },
    { permission: "customers:read", label: "customers", run: (a) => createMysqlCustomerRepository().search(a, storeId, { page: 1, pageSize: 10 }) },
    { permission: "inventory:read", label: "stock", run: (a) => createMysqlInventoryRepository().levels(a, []) },
    { permission: "reports:read", label: "report stock", run: (a) => createMysqlInventoryRepository().reportLevels(a, []) },
    { permission: "orders:read", label: "orders", run: (a) => createMysqlOrderRepository().search(a, storeId, { page: 1, pageSize: 10 }) },
    { permission: "payments:read", label: "ledger", run: (a) => createMysqlOrderRepository().ledger(a, storeId, { kind: "payments", page: 1, pageSize: 10 }) },
    { permission: "promotions:read", label: "promotions", run: (a) => createMysqlPromotionRepository().listAll(a, storeId) },
    { permission: "search:read", label: "analytics", run: (a) => createMysqlSearchRepository().report(a, storeId, 30, 10) },
    { permission: "marketing:read", label: "abandoned carts", run: (a) => createMysqlCartRepository().listAbandoned(a, storeId, { olderThanHours: 1, page: 1, pageSize: 10 }) },
    { permission: "marketing:read", label: "subscribers", run: (a) => createMysqlContentRepository().listSubscribers(a, storeId, { page: 1, pageSize: 10 }) },
    { permission: "audit:read", label: "audit", run: (a) => platform.searchAudit(a, storeId, { page: 1, pageSize: 10 }) },
  ]
  it.each(PRESET_ROLES)("enforces stored $key grants across protected raw reads, even with inflated caller claims", async (role) => {
    await reset(role.key)
    for (const read of reads) {
      const result = read.run(actor())
      if (role.permissions.includes(read.permission)) await expect(result, read.label).resolves.toBeDefined()
      else await expect(result, read.label).rejects.toMatchObject({ code: "forbidden" })
    }
    await reset()
  })
  it.each(["anonymous", "customer"])("denies all protected raw reads to %s", async (kind) => {
    const visitor: Actor = kind === "anonymous" ? anonymousActor(storeId) : { kind: "customer", id: uuidv7(), email: "customer@example.test", storeId, permissions: ALL_PERMISSIONS, mfaVerifiedAt: null }
    for (const read of reads) await expect(read.run(visitor), read.label).rejects.toMatchObject({ code: "forbidden" })
  })
})
