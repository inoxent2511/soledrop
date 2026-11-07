import { createHash } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { ALL_PERMISSIONS, PERMISSIONS, PRESET_ROLES } from "@/server/admin/permissions"
import type { AdminRepository } from "@/server/admin/repository"
import type { StaffMember } from "@/server/admin/types"
import type { CustomerRepository } from "@/server/customers/repository"
import type { CartRepository } from "@/server/cart/repository"
import type { CatalogRepository } from "@/server/catalog/repository"
import type { InventoryRepository } from "@/server/inventory/repository"
import type { OrderDraft, OrderRepository } from "@/server/orders/repository"
import type { PlatformRepository } from "@/server/platform/repository"
import type { SearchRepository } from "@/server/search/repository"
import { createFixturesAdminRepository } from "@/server/admin/fixtures.repository"
import { createFixturesCustomerRepository } from "@/server/customers/fixtures.repository"
import { createFixturesCartRepository } from "@/server/cart/fixtures.repository"
import { createFixturesCatalogRepository } from "@/server/catalog/fixtures.repository"
import { createFixturesInventoryRepository } from "@/server/inventory/fixtures.repository"
import { createFixturesOrderRepository } from "@/server/orders/fixtures.repository"
import { createFixturesPlatformRepository } from "@/server/platform/fixtures.repository"
import { createFixturesSearchRepository } from "@/server/search/fixtures.repository"
import { createMysqlAdminRepository } from "@/server/admin/mysql.repository"
import { createMysqlCustomerRepository } from "@/server/customers/mysql.repository"
import { createMysqlCartRepository } from "@/server/cart/mysql.repository"
import { createMysqlCatalogRepository } from "@/server/catalog/mysql.repository"
import { createMysqlInventoryRepository } from "@/server/inventory/mysql.repository"
import { createMysqlOrderRepository } from "@/server/orders/mysql.repository"
import { createMysqlPlatformRepository } from "@/server/platform/mysql.repository"
import { createMysqlSearchRepository } from "@/server/search/mysql.repository"
import { systemActor } from "@/server/db/actor"
import { bindActor } from "@/server/db/bind"
import { closeDatabase, database } from "@/server/db/client"
import { orderNumberSequences, orders as orderRows, products, staffRoles, stores } from "@/server/db/schema"
import { uuidv7 } from "@/server/db/uuid"
import { db as fixtureDb, resetFixtures } from "@/server/fixtures/store"
import type { Order } from "@/server/orders/types"
import type { Customer } from "@/server/customers/types"
import type { CartRow } from "@/server/cart/types"
import { connect, engines } from "./connections"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
for (const [engine, configuration] of [["fixtures", null] as const, ...engines] as const) describe(engine + " identity/commerce/jobs contract", () => {
  const fixture = engine === "fixtures", storeId = uuidv7(), actor = systemActor(storeId, "migration", ALL_PERMISSIONS), resolve = () => actor
  const admin: AdminRepository = fixture ? createFixturesAdminRepository() : bindActor<AdminRepository>(createMysqlAdminRepository(), resolve)
  const customers: CustomerRepository = fixture ? createFixturesCustomerRepository() : bindActor<CustomerRepository>(createMysqlCustomerRepository(), resolve)
  const carts: CartRepository = fixture ? createFixturesCartRepository() : bindActor<CartRepository>(createMysqlCartRepository(), resolve)
  const catalog: CatalogRepository = fixture ? createFixturesCatalogRepository() : bindActor<CatalogRepository>(createMysqlCatalogRepository(), resolve)
  const inventory: InventoryRepository = fixture ? createFixturesInventoryRepository() : bindActor<InventoryRepository>(createMysqlInventoryRepository(), resolve)
  const orders: OrderRepository = fixture ? createFixturesOrderRepository() : bindActor<OrderRepository>(createMysqlOrderRepository(), resolve)
  const platform: PlatformRepository = fixture ? createFixturesPlatformRepository() : bindActor<PlatformRepository>(createMysqlPlatformRepository(), resolve)
  const search: SearchRepository = fixture ? createFixturesSearchRepository() : bindActor<SearchRepository>(createMysqlSearchRepository(), resolve)
  const variantId = uuidv7(), productId = uuidv7(), customerId = uuidv7(), ownerId = uuidv7(), secondOwnerId = uuidv7(), at = new Date().toISOString()
  let customer: Customer, cart: CartRow, order: Order
  let draft: OrderDraft
  beforeAll(async () => {
    if (fixture) {
      resetFixtures()
      Object.assign(fixtureDb(), { brands: [], products: [], collections: [], orders: [], carts: [], inventory: [], reservations: [], customers: [], addresses: [], sessions: [], passwordResets: [], outbox: [], audit: [], searchSynonyms: [], searchEvents: [] })
    } else { await closeDatabase(); process.env.DATABASE_URL = configuration!.appUrl; await (await database()).insert(stores).values({ id: storeId, name: "Commerce contract" }) }
  })
  afterAll(async () => {
    if (!fixture) {
      const cleanup = await connect(configuration!.migratorUrl)
      try {
        await cleanup.execute("DELETE r FROM refunds r INNER JOIN orders o ON o.id = r.order_id WHERE o.store_id = ?", [Buffer.from(storeId.replaceAll("-", ""), "hex")])
        const db = await database()
        await db.delete(orderRows).where(eq(orderRows.storeId, storeId))
        await db.delete(products).where(eq(products.storeId, storeId))
        await db.delete(staffRoles).where(eq(staffRoles.storeId, storeId))
        await db.delete(orderNumberSequences).where(eq(orderNumberSequences.storeId, storeId))
        await db.delete(stores).where(eq(stores.id, storeId))
      } finally { await cleanup.end(); await closeDatabase() }
    }
  })

  it("preserves customer identity, hashed sessions and single-use reset tokens", async () => {
    customer = { id: customerId, storeId, email: "contract@example.test", passwordHash: "scrypt$contract-hash", fullName: "Contract Customer", phone: "+92 300 1234567", group: "retail", marketingOptIn: true, createdAt: at, deletionRequestedAt: null }
    expect(await customers.create(customer)).toEqual(customer)
    expect(await customers.findByEmail(storeId, customer.email)).toEqual(customer)
    const tokenHash = hash(uuidv7()), expiresAt = new Date(Date.now() + 3_600_000).toISOString()
    await customers.createSession({ tokenHash, customerId, createdAt: at, expiresAt })
    expect((await customers.findSession(tokenHash))?.customerId).toBe(customerId)
    await customers.createReset({ tokenHash, customerId, expiresAt, usedAt: null })
    expect((await customers.consumeReset(tokenHash))?.usedAt).toBeTruthy()
    expect(await customers.consumeReset(tokenHash)).toBeNull()
    await customers.deleteSession(tokenHash)
    expect(await customers.findSession(tokenHash)).toBeNull()
  })

  it("keeps exactly one default address and refuses changing a foreign address", async () => {
    const input = { fullName: customer.fullName, phone: customer.phone!, line1: "10 Test Street", city: "Karachi", province: "Sindh", country: "PK", isDefault: false }
    const first = await customers.saveAddress(customerId, input)
    expect(first.isDefault).toBe(true)
    const second = await customers.saveAddress(customerId, { ...input, line1: "20 Test Street", isDefault: true })
    const addresses = await customers.listAddresses(customerId)
    expect(addresses.filter((row) => row.isDefault).map((row) => row.id)).toEqual([second.id])
    await expect(customers.saveAddress(customerId, { ...input, id: uuidv7() })).rejects.toMatchObject({ code: "not_found" })
    await customers.deleteAddress(customerId, second.id)
    expect((await customers.listAddresses(customerId))[0].isDefault).toBe(true)
  })

  it("registers roles, preserves the last active Owner and serializes role changes", async () => {
    await admin.syncRegistry(storeId, ALL_PERMISSIONS.map((key) => ({ key, label: PERMISSIONS[key].label, group: PERMISSIONS[key].group, sensitive: false })), PRESET_ROLES)
    const create = (userId: string, email: string): StaffMember => ({ userId, storeId, email, displayName: "Contract staff", status: "active", passwordHash: "scrypt$staff-hash", totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [], failedLogins: 0, lockedUntil: null, lastSeenAt: null, createdAt: at, updatedAt: at })
    await admin.createMember(create(ownerId, "owner@example.test"))
    await admin.setRoles(storeId, ownerId, ["owner"])
    expect(await admin.countActiveOwners(storeId)).toBe(1)
    await expect(admin.setRoles(storeId, ownerId, [])).rejects.toMatchObject({ code: "conflict" })
    await expect(admin.updateMember(storeId, ownerId, { status: "suspended" })).rejects.toMatchObject({ code: "conflict" })
    await admin.createMember(create(secondOwnerId, "second@example.test"))
    await admin.setRoles(storeId, secondOwnerId, ["owner"])
    await admin.setRoles(storeId, ownerId, ["support_agent"])
    expect(await admin.countActiveOwners(storeId)).toBe(1)
    expect((await admin.rolesOf(storeId, ownerId)).map((role) => role.key)).toEqual(["support_agent"])
    const role = { id: uuidv7(), storeId, key: "contract_role", name: "Contract", description: "Contract role", isSystem: false, refundLimit: 10000, permissions: ["products:read" as const], createdAt: at, updatedAt: at }
    expect(await admin.createRole(role)).toEqual(role)
    expect((await admin.updateRole(storeId, role.key, { name: "Renamed" }, at)).name).toBe("Renamed")
    await expect(admin.updateRole(storeId, role.key, { name: "Stale" }, at)).rejects.toMatchObject({ code: "conflict" })
    await admin.deleteRole(storeId, role.key)
  })

  it("stores invite hashes, assurance timestamps and revokes staff sessions", async () => {
    const tokenHash = hash(uuidv7()), expiresAt = new Date(Date.now() + 3_600_000).toISOString()
    const invite = { id: uuidv7(), storeId, email: "invite@example.test", roleKey: "support_agent", tokenHash, invitedBy: ownerId, expiresAt, acceptedAt: null, revokedAt: null, createdAt: at }
    expect(await admin.createInvite(invite)).toEqual(invite)
    expect(await admin.findInviteByTokenHash(tokenHash)).toEqual(invite)
    await admin.updateInvite(invite.id, { revokedAt: at })
    expect((await admin.listInvites(storeId))[0].revokedAt).toBe(at)
    const session = { id: uuidv7(), userId: ownerId, storeId, tokenHash, aal: 2 as const, mfaAt: at, ip: "127.0.0.1", userAgent: "Contract", createdAt: at, lastSeenAt: at, expiresAt, revokedAt: null }
    await admin.createSession(session)
    expect(await admin.findSessionByTokenHash(tokenHash)).toEqual(session)
    await admin.revokeSessions(storeId, ownerId)
    expect((await admin.listSessions(storeId, ownerId))[0].revokedAt).toBeTruthy()
  })

  it("reserves stock atomically and places exactly one idempotent order", async () => {
    const brand = { id: uuidv7(), slug: "commerce-brand", name: "Commerce", position: 0 }
    await catalog.createBrand(storeId, brand)
    await catalog.saveProduct(storeId, { id: productId, storeId, slug: "commerce-shoe", title: "Commerce shoe", brand, kind: "new", gender: "unisex", status: "active", description: "", condition: null, conditionNotes: null, images: [], variants: [{ id: variantId, sku: "COMMERCE-" + storeId, size: { eu: "42", uk: "8", us: "9", cm: "27" }, attributes: {}, weightGrams: 0, position: 0 }], attributes: {}, customFields: {}, collections: [], tags: [], position: 0, publishedAt: at, seo: {} }, null)
    expect(await inventory.adjust(variantId, 5, "Contract opening stock", "migration")).toBe(5)
    cart = await carts.create({ id: uuidv7(), storeId, tokenHash: hash(uuidv7()), customerId, currency: "PKR", lines: [{ id: uuidv7(), variantId, quantity: 1, addedAt: at }], promotionCodes: [], status: "active", createdAt: at, updatedAt: at })
    await inventory.reserve(cart.id, [{ variantId, quantity: 1 }], 15)
    expect((await inventory.availability([variantId])).get(variantId)).toBe(4)
    expect((await inventory.availability([variantId], cart.id)).get(variantId)).toBe(5)
    const line = { id: uuidv7(), variantId, productId, slug: "commerce-shoe", title: "Commerce shoe", brand: brand.name, kind: "new" as const, condition: null, size: { eu: "42", uk: "8", us: "9" }, imageUrl: "", sku: "COMMERCE-" + storeId, quantity: 1, unitPrice: 10000, compareAt: null, discount: 0, tax: 0, total: 10000, refundedQuantity: 0 }
    draft = { storeId, customerId, email: customer.email, phone: customer.phone!, status: "confirmed", paymentStatus: "unpaid", fulfillmentStatus: "unfulfilled", currency: "PKR", subtotal: 10000, discountTotal: 0, shippingTotal: 0, taxTotal: 0, taxIncluded: true, total: 10000, lines: [line], promotionCodes: [], shippingAddress: { fullName: customer.fullName, phone: customer.phone!, line1: "10 Test Street", city: "Karachi", province: "Sindh", country: "PK" }, shippingMethod: { code: "standard", label: "Standard", amount: 0, minDays: 2, maxDays: 5 }, paymentMethod: "cod", idempotencyKey: uuidv7(), accessTokenHash: hash(uuidv7()), customFields: {}, note: null, trackingNumber: null }
    const input = { draft, cartId: cart.id, promotionIds: [], event: { topic: "order.placed" as const, payload: {} } }
    const first = await orders.placeOrder(input)
    order = first.order
    expect(first.replayed).toBe(false)
    const replay = await orders.placeOrder(input)
    expect(replay.replayed).toBe(true)
    expect(replay.order).toEqual(order)
    expect((await inventory.onHand([variantId])).get(variantId)).toBe(4)
    expect((await inventory.levels([variantId]))[0].reserved).toBe(0)
    expect((await carts.findById(cart.id))?.status).toBe("converted")
  })

  it("records payments once, follows the state machine, notes and return decisions", async () => {
    const input = { orderId: order.id, provider: "cod", status: "captured" as const, amount: 10000, currency: "PKR" as const, providerRef: null, idempotencyKey: uuidv7() }
    const paid = await orders.recordPayment(input)
    const pendingAfterPayment = (await platform.outboxSummary(storeId)).pending
    expect(await orders.recordPayment(input)).toEqual(paid)
    expect((await platform.outboxSummary(storeId)).pending).toBe(pendingAfterPayment)
    expect((await orders.listPayments(order.id)).length).toBe(1)
    expect((await orders.findById(order.id))?.paymentStatus).toBe("paid")
    await expect(orders.transition(order.id, "delivered", "migration")).rejects.toMatchObject({ code: "invalid_transition" })
    for (const status of ["processing", "shipped", "delivered"] as const) await orders.transition(order.id, status, "migration")
    const note = await orders.addNote({ orderId: order.id, author: ownerId, authorName: "Contract staff", body: "Internal contract note" })
    expect(await orders.listNotes(order.id)).toEqual([note])
    const request = await orders.createReturn({ orderId: order.id, lines: [{ orderLineId: order.lines[0].id, quantity: 1 }], reason: "Fit" })
    expect((await orders.decideReturn(request.id, "approved", "migration")).status).toBe("approved")
    expect((await orders.restockReturn(request.id, "migration")).status).toBe("received")
    await orders.restockReturn(request.id, "migration")
    expect((await inventory.onHand([variantId])).get(variantId)).toBe(5)
  })

  it("keeps refund ceilings, replay semantics, listing and money ledger", async () => {
    const paid = (await orders.listPayments(order.id))[0]
    const input = { orderId: order.id, paymentId: paid.id, amount: 5000, reason: "Partial refund", lines: [{ orderLineId: order.lines[0].id, quantity: 1 }], restock: true, idempotencyKey: uuidv7() }
    const first = await orders.createRefund(input)
    expect(await orders.createRefund(input)).toEqual(first)
    expect((await inventory.onHand([variantId])).get(variantId)).toBe(5)
    await expect(orders.createRefund({ ...input, lines: [], amount: 6000, idempotencyKey: uuidv7() })).rejects.toMatchObject({ code: "validation" })
    expect((await orders.findByNumber(storeId, order.number))?.refundedTotal).toBe(5000)
    expect((await orders.search(storeId, { q: order.number, page: 1, pageSize: 10 })).total).toBe(1)
    expect((await orders.listByCustomer(storeId, customerId)).length).toBe(1)
    expect((await orders.listRefunds(order.id)).length).toBe(1)
    expect((await orders.ledger(storeId, { kind: "payments", page: 1, pageSize: 10 })).rows[0].amount).toBe(10000)
  })

  it("claims durable events once, retries failures and shares analytics contracts", async () => {
    const queued = await platform.enqueue(storeId, "contact.received", { messageId: uuidv7() })
    const claimed = await platform.claimDue(100)
    expect(claimed.some((row) => row.id === queued.id)).toBe(true)
    expect(await platform.claimDue(100)).toEqual([])
    await platform.markFailed(queued.id, "Simulated mail outage", 1)
    expect((await platform.outboxSummary(storeId)).failed).toBe(1)
    await platform.retryEvent(storeId, queued.id)
    const [retry] = await platform.claimDue(100)
    expect(retry.id).toBe(queued.id)
    await platform.markDelivered(queued.id)
    expect((await platform.outboxSummary(storeId)).failed).toBe(0)
    const synonym = { id: uuidv7(), term: "trainers", synonyms: ["sneakers", "shoes"] }
    expect(await search.saveSynonym(storeId, synonym)).toEqual(synonym)
    expect(await search.listSynonyms(storeId)).toEqual([synonym])
    await search.logEvent(storeId, { id: uuidv7(), query: "Trainers", normalized: "trainers", resultCount: 2, clickedSlug: null, source: "page", createdAt: at })
    await search.logEvent(storeId, { id: uuidv7(), query: "Missing", normalized: "missing", resultCount: 0, clickedSlug: null, source: "page", createdAt: at })
    await search.logEvent(storeId, { id: uuidv7(), query: "Trainers", normalized: "trainers", resultCount: null, clickedSlug: "commerce-shoe", source: "page", createdAt: at })
    expect(await search.trending(storeId, 30, 10)).toEqual([{ query: "trainers", count: 1 }])
    expect(await search.report(storeId, 30, 10)).toEqual({ searches: 2, zeroResultSearches: 1, clicks: 1, top: [{ query: "trainers", count: 1, clicks: 1 }], zero: [{ query: "missing", count: 1 }] })
    await search.deleteSynonym(storeId, synonym.id)
    expect(await platform.hit("contract-rate", 60)).toBe(1)
    expect(await platform.hit("contract-rate", 60)).toBe(2)
    await platform.saveIdempotent("contract-response", 201, { id: order.id })
    expect(await platform.getIdempotent("contract-response")).toEqual({ status: 201, body: { id: order.id } })
  })

  it("anonymises history and scrubs credentials/addresses without losing accounting totals", async () => {
    expect(await orders.anonymiseCustomer(customerId)).toBe(1)
    await customers.scrub(customerId)
    const scrubbed = await customers.findById(customerId)
    expect(scrubbed?.email).toContain("@invalid")
    expect(scrubbed?.passwordHash).toBe("")
    expect(await customers.listAddresses(customerId)).toEqual([])
    expect((await orders.findById(order.id))?.total).toBe(10000)
  })
})
