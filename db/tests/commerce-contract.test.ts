import { createHash } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { ALL_PERMISSIONS, PERMISSIONS, PRESET_ROLES } from "@/server/admin/permissions"
import type { AdminOperations } from "@/server/admin/repository"
import type { StaffMember } from "@/server/admin/types"
import type { CustomerOperations } from "@/server/customers/repository"
import type { CartOperations } from "@/server/cart/repository"
import type { CatalogOperations } from "@/server/catalog/repository"
import type { InventoryOperations } from "@/server/inventory/repository"
import type { OrderDraft, OrderOperations } from "@/server/orders/repository"
import type { PlatformOperations } from "@/server/platform/repository"
import type { SearchOperations } from "@/server/search/repository"
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
import { anonymousActor, systemActor, type Actor } from "@/server/db/actor"
import { bindActor } from "@/server/db/bind"
import { closeDatabase, database } from "@/server/db/client"
import { inventoryLevels, inventoryReservations, orderNumberSequences, orders as orderRows, products, staffRoles, stores } from "@/server/db/schema"
import { sqlDate } from "@/server/db/values"
import { scopedKey } from "@/server/platform/scoped-key"
import { uuidv7 } from "@/server/db/uuid"
import { db as fixtureDb, resetFixtures } from "@/server/fixtures/store"
import type { Order } from "@/server/orders/types"
import type { Customer } from "@/server/customers/types"
import type { CartRow } from "@/server/cart/types"
import { connect, engines } from "./connections"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
for (const [engine, configuration] of [["fixtures", null] as const, ...engines] as const) describe(engine + " identity/commerce/jobs contract", () => {
  const fixture = engine === "fixtures", storeId = uuidv7(), actor = systemActor(storeId, "migration", ALL_PERMISSIONS), resolve = () => actor
  const admin: AdminOperations = bindActor<AdminOperations>(fixture ? createFixturesAdminRepository() : createMysqlAdminRepository(), resolve)
  const customers: CustomerOperations = bindActor<CustomerOperations>(fixture ? createFixturesCustomerRepository() : createMysqlCustomerRepository(), resolve)
  const carts: CartOperations = bindActor<CartOperations>(fixture ? createFixturesCartRepository() : createMysqlCartRepository(), resolve)
  const catalog: CatalogOperations = bindActor<CatalogOperations>(fixture ? createFixturesCatalogRepository() : createMysqlCatalogRepository(), resolve)
  const inventory: InventoryOperations = bindActor<InventoryOperations>(fixture ? createFixturesInventoryRepository() : createMysqlInventoryRepository(), resolve)
  const orders: OrderOperations = bindActor<OrderOperations>(fixture ? createFixturesOrderRepository() : createMysqlOrderRepository(), resolve)
  const platform: PlatformOperations = bindActor<PlatformOperations>(fixture ? createFixturesPlatformRepository() : createMysqlPlatformRepository(), resolve)
  const search: SearchOperations = bindActor<SearchOperations>(fixture ? createFixturesSearchRepository() : createMysqlSearchRepository(), resolve)
  const variantId = uuidv7(), productId = uuidv7(), customerId = uuidv7(), ownerId = uuidv7(), secondOwnerId = uuidv7(), at = new Date().toISOString()
  let customer: Customer, cart: CartRow, order: Order
  let draft: OrderDraft
  beforeAll(async () => {
    if (fixture) {
      resetFixtures()
      fixtureDb().stores[0].id = storeId
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
    await admin.updateMember(storeId, ownerId, { totpSecret: "contract-sealed-secret", totpEnabledAt: at })
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

  it("keeps masked address cards and credential-free customer DTOs for staff without PII access", async () => {
    const memberId = uuidv7(), sessionId = uuidv7(), preset = PRESET_ROLES.find((role) => role.key === "read_only")!
    await admin.createMember({ userId: memberId, storeId, email: "masked-reader@example.test", displayName: "Masked reader", status: "active", passwordHash: null, totpSecret: "fixture-enrolled-factor", totpEnabledAt: at, totpLastStep: null, recoveryCodes: [], failedLogins: 0, lockedUntil: null, lastSeenAt: null, createdAt: at, updatedAt: at })
    await admin.setRoles(storeId, memberId, [preset.key])
    await admin.createSession({ id: sessionId, userId: memberId, storeId, tokenHash: hash(uuidv7()), aal: 2, mfaAt: at, ip: null, userAgent: null, createdAt: at, lastSeenAt: at, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), revokedAt: null })
    const reader: Actor = { kind: "staff", id: memberId, sessionId, storeId, permissions: preset.permissions, roleKeys: [preset.key], refundLimit: 0, mfaVerifiedAt: at }
    const raw = fixture ? createFixturesCustomerRepository() : createMysqlCustomerRepository()
    expect(await raw.findById(reader, customerId)).toMatchObject({ email: "c•••@example.test", phone: "•••567", passwordHash: "" })
    const original = await customers.listAddresses(customerId), masked = await raw.listAddresses(reader, customerId)
    expect(masked).toHaveLength(original.length)
    expect(masked[0]).toMatchObject({ fullName: "Contract", phone: "•••567", line1: "•••" })
    expect(JSON.stringify(masked)).not.toContain("Test Street")
    await expect(raw.findById({ ...reader, permissions: [] }, customerId)).rejects.toMatchObject({ code: "forbidden" })
  })

  it("claims each delivery channel once, retains completed receipts and defers without spending attempts", async () => {
    const event = await platform.enqueue(storeId, "contact.received", { id: uuidv7() })
    const claims = await Promise.all([platform.claimDelivery(event.id, "email"), platform.claimDelivery(event.id, "email")])
    expect(claims.map((claim) => claim.status).sort()).toEqual(["busy", "claimed"])
    await platform.finishDelivery(event.id, "email", claims.find((claim) => claim.status === "claimed")!.token!, true)
    expect((await platform.claimDelivery(event.id, "email")).status).toBe("delivered")
    const webhook = await platform.claimDelivery(event.id, "webhook:test")
    expect(webhook.status).toBe("claimed")
    await platform.finishDelivery(event.id, "webhook:test", webhook.token!, false)
    expect((await platform.claimDelivery(event.id, "webhook:test")).status).toBe("claimed")
    expect((await platform.claimDelivery(event.id, "email")).status).toBe("delivered")
    const due = await platform.claimDue(100), claimed = due.find((row) => row.id === event.id)!
    expect(claimed.attempts).toBe(1)
    await platform.deferEvent(event.id, new Date(Date.now() + 3_600_000).toISOString())
    expect((await platform.claimDue(100)).some((row) => row.id === event.id)).toBe(false)
    await expect(platform.cleanup(1001)).rejects.toMatchObject({ code: "validation" })
    expect(await platform.cleanup(10)).toMatchObject({ rateLimits: expect.any(Number), idempotency: expect.any(Number) })
  })

  it("applies customer ownership and store predicates inside the raw fixture/SQL boundary", async () => {
    const raw = fixture ? createFixturesCustomerRepository() : createMysqlCustomerRepository()
    const owner: Actor = { kind: "customer", id: customerId, email: customer.email, storeId, permissions: [], mfaVerifiedAt: null }
    expect((await raw.findById(owner, customerId))?.id).toBe(customerId)
    await expect(raw.findById(anonymousActor(storeId), customerId)).rejects.toMatchObject({ code: "forbidden" })
    await expect(raw.findById({ ...owner, id: uuidv7() }, customerId)).rejects.toMatchObject({ code: "forbidden" })
    await expect(raw.update({ ...owner, id: uuidv7() }, customerId, { fullName: "Foreign write" })).rejects.toMatchObject({ code: "forbidden" })
    expect(await raw.findById({ ...owner, storeId: uuidv7() }, customerId)).toBeNull()
    const otherStore = uuidv7(), foreign = systemActor(otherStore, "auth:customer")
    expect(await raw.findByEmail(foreign, otherStore, customer.email)).toBeNull()
    await expect(raw.findByEmail(foreign, storeId, customer.email)).rejects.toMatchObject({ code: "forbidden" })
    expect((await customers.findById(customerId))?.fullName).toBe("Contract Customer")
  })

  it("fences an expired delivery worker out of a replacement worker's receipt", async () => {
    const event = await platform.enqueue(storeId, "contact.received", { id: uuidv7() })
    const old = await platform.claimDelivery(event.id, "email")
    if (fixture) fixtureDb().deliveryChannels!.get(event.id + ":email")!.leaseUntil = 0
    else {
      const maintenance = await connect(configuration!.migratorUrl)
      try { await maintenance.execute("UPDATE outbox_channels SET lease_until = '2000-01-01 00:00:00' WHERE event_id = ? AND channel = 'email'", [Buffer.from(event.id.replaceAll("-", ""), "hex")]) }
      finally { await maintenance.end() }
    }
    const replacement = await platform.claimDelivery(event.id, "email")
    expect(replacement.status).toBe("claimed")
    expect(replacement.token).not.toBe(old.token)
    expect(await platform.finishDelivery(event.id, "email", old.token!, true)).toBe(false)
    expect((await platform.claimDelivery(event.id, "email")).status).toBe("busy")
    expect(await platform.finishDelivery(event.id, "email", replacement.token!, true)).toBe(true)
    expect((await platform.claimDelivery(event.id, "email")).status).toBe("delivered")
  })

  it("prevents another customer from reading or changing carts, orders, returns and cached private responses", async () => {
    const before = await orders.findById(order.id)
    const outsider = await customers.create({ ...customer, id: uuidv7(), email: "outsider@example.test" })
    const mine: Actor = { kind: "customer", id: customerId, email: customer.email, storeId, permissions: [], mfaVerifiedAt: null }
    const other: Actor = { ...mine, id: outsider.id, email: outsider.email }
    const rawOrders = fixture ? createFixturesOrderRepository() : createMysqlOrderRepository()
    const rawCarts = fixture ? createFixturesCartRepository() : createMysqlCartRepository()
    const rawPlatform = fixture ? createFixturesPlatformRepository() : createMysqlPlatformRepository()
    expect((await rawOrders.findById(mine, order.id))?.id).toBe(order.id)
    expect(await rawOrders.findById(other, order.id)).toBeNull()
    expect(await rawOrders.findByNumber(other, storeId, order.number)).toBeNull()
    expect(await rawOrders.findByIdempotencyKey(other, storeId, order.idempotencyKey)).toBeNull()
    expect(await rawOrders.listByEmail(other, storeId, customer.email)).toEqual([])
    await expect(rawOrders.listByCustomer(other, storeId, customerId)).rejects.toMatchObject({ code: "forbidden" })
    await expect(rawOrders.transition(other, order.id, "cancelled", outsider.id)).rejects.toMatchObject({ code: "not_found" })
    await expect(rawOrders.createReturn(other, { orderId: order.id, lines: [{ orderLineId: order.lines[0].id, quantity: 1 }], reason: "Foreign return" })).rejects.toMatchObject({ code: "not_found" })
    expect(await rawCarts.findById(other, cart.id)).toBeNull()
    await expect(rawCarts.save(other, cart)).rejects.toMatchObject({ code: "forbidden" })
    await rawPlatform.saveIdempotent(mine, "same-key", 200, { private: customer.email })
    expect(await rawPlatform.getIdempotent(other, "same-key")).toBeNull()
    await rawPlatform.saveIdempotent(mine, "same-key", 201, { replaced: true })
    expect(await rawPlatform.getIdempotent(mine, "same-key")).toEqual({ status: 200, body: { private: customer.email } })
    expect(await orders.findById(order.id)).toEqual(before)
  })

  it("requires the actual guest cart or order proof for replay and hides it across stores", async () => {
    const rawOrders = fixture ? createFixturesOrderRepository() : createMysqlOrderRepository()
    const rawCarts = fixture ? createFixturesCartRepository() : createMysqlCartRepository()
    const guestCart = await carts.create({ ...cart, id: uuidv7(), customerId: null, tokenHash: hash(uuidv7()), status: "active", lines: [{ ...cart.lines[0], id: uuidv7() }] })
    const guest = { ...anonymousActor(storeId), cartTokenHash: guestCart.tokenHash }
    const input = { cartId: guestCart.id, draft: { ...draft, customerId: null, lines: draft.lines.map((line) => ({ ...line, id: uuidv7() })), idempotencyKey: uuidv7(), accessTokenHash: hash(uuidv7()) }, promotionIds: [], event: { topic: "order.placed" as const, payload: {} } }
    const placed = await rawOrders.placeOrder(guest, input)
    expect((await rawOrders.findByIdempotencyKey(guest, storeId, input.draft.idempotencyKey))?.id).toBe(placed.order.id)
    const stranger = { ...anonymousActor(storeId), cartTokenHash: hash(uuidv7()) }
    expect(await rawOrders.findById(stranger, placed.order.id)).toBeNull()
    expect(await rawOrders.findByIdempotencyKey(stranger, storeId, input.draft.idempotencyKey)).toBeNull()
    await expect(rawOrders.placeOrder(stranger, input)).rejects.toMatchObject({ code: "not_found" })
    expect(await rawCarts.findById(stranger, guestCart.id)).toBeNull()
    const link = { ...anonymousActor(storeId), orderAccessTokenHash: input.draft.accessTokenHash }
    expect((await rawOrders.findById(link, placed.order.id))?.id).toBe(placed.order.id)
    expect(await rawOrders.findById({ ...link, storeId: uuidv7() }, placed.order.id)).toBeNull()
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

  it("refreshes an expired idempotency entry while retaining first-write-wins within its live window", async () => {
    const key = "expired-cache-refresh"
    await platform.saveIdempotent(key, 200, { version: 1 })
    if (fixture) fixtureDb().idempotency.get(scopedKey(actor, key, true))!.at = 0
    else {
      const maintenance = await connect(configuration!.migratorUrl)
      try { await maintenance.execute("UPDATE idempotency_keys SET expires_at = '2000-01-01 00:00:00' WHERE `key` = ?", [scopedKey(actor, key, true)]) }
      finally { await maintenance.end() }
    }
    expect(await platform.getIdempotent(key)).toBeNull()
    await platform.saveIdempotent(key, 201, { version: 2 })
    await platform.saveIdempotent(key, 202, { version: 3 })
    expect(await platform.getIdempotent(key)).toEqual({ status: 201, body: { version: 2 } })
  })

  it("bounds scheduled expiry but never lets an unrelated backlog block a shopper's own sizes", async () => {
    const original = (await catalog.getProductById(storeId, productId))!
    const oldVariant = { ...original.variants[0], id: "00000000" + uuidv7().slice(8), sku: "OLD-HOLDS-" + storeId }
    await catalog.saveProduct(storeId, { ...original, id: uuidv7(), slug: "old-holds-" + storeId, variants: [oldVariant] }, null)
    await inventory.adjust(oldVariant.id, 501, "Expired hold backlog", "migration")
    const oldCart = await carts.create({ ...cart, id: uuidv7(), customerId: null, tokenHash: hash(uuidv7()), status: "active", lines: [] })
    const activeCart = await carts.create({ ...oldCart, id: uuidv7(), tokenHash: hash(uuidv7()) })
    const quantity = (await inventory.levels([variantId]))[0].onHand
    const expired = Array.from({ length: 501 }, () => ({ id: uuidv7(), cartId: oldCart.id, variantId: oldVariant.id, quantity: 1, expiresAt: "2000-01-01T00:00:00.000Z" }))
    expired.push({ id: uuidv7(), cartId: oldCart.id, variantId, quantity, expiresAt: "2000-01-01T00:00:00.000Z" })
    if (fixture) {
      fixtureDb().reservations.push(...expired)
      fixtureDb().inventory.find((row) => row.variantId === oldVariant.id)!.reserved = 501
      fixtureDb().inventory.find((row) => row.variantId === variantId)!.reserved = quantity
    } else {
      const db = await database()
      await db.insert(inventoryReservations).values(expired.map((row) => ({ ...row, expiresAt: sqlDate(row.expiresAt) })))
      await db.update(inventoryLevels).set({ reserved: 501 }).where(eq(inventoryLevels.variantId, oldVariant.id))
      await db.update(inventoryLevels).set({ reserved: quantity }).where(eq(inventoryLevels.variantId, variantId))
    }
    await inventory.reserve(activeCart.id, [{ variantId, quantity }], 15)
    expect((await inventory.levels([variantId]))[0]).toMatchObject({ onHand: quantity, reserved: quantity })
    expect(await inventory.releaseExpired()).toBe(500)
    expect(await inventory.releaseExpired()).toBe(1)
    expect(await inventory.releaseExpired()).toBe(0)
    await inventory.release(activeCart.id)
    expect((await inventory.levels([variantId]))[0]).toMatchObject({ onHand: quantity, reserved: 0 })
  })
})
