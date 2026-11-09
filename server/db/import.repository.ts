import "server-only"

import { createHash } from "node:crypto"
import { count, eq } from "drizzle-orm"
import type { FixtureTables } from "@/server/fixtures/tables"
import { createMysqlCatalogRepository } from "@/server/catalog/mysql.repository"
import type { Actor } from "./actor"
import { requireStore, requireSystem } from "./actor"
import { withTransaction } from "./client"
import * as s from "./schema"
import { isoDate, jsonValue, nullableSqlDate, sqlDate } from "./values"
import { uuidv7 } from "./uuid"
import { DomainError } from "@/server/shared/errors"
import { serverEnv } from "@/lib/env.server"
import { sealDeliveryPayload } from "@/server/platform/private-payload"
import { syncCatalogueListing } from "@/server/catalog/listing-index.repository"
import { syncOrderSearch } from "@/server/orders/search-index.repository"

export type ImportCounts = Record<string, number>

/** Complete trusted local snapshot import. Refuses to overwrite a nonempty merchant database. */
export async function importSnapshot(actor: Actor, source: FixtureTables, digest: string): Promise<ImportCounts> {
  requireSystem(actor, ["migration"])
  if (source.stores.length !== 1) throw new DomainError("validation", "Import one deployment store at a time.")
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new DomainError("validation", "Invalid source digest.")
  requireStore(actor, source.stores[0].id)
  const counts: ImportCounts = Object.fromEntries(Object.entries(source).filter((entry) => Array.isArray(entry[1])).map(([key, value]) => [key, (value as unknown[]).length]))
  counts.home = source.home ? 1 : 0
  counts.rateLimits = source.rateLimits.size
  counts.idempotency = source.idempotency.size
  return withTransaction(async (db) => {
    // The unique INSERT serializes importers without requesting UPDATE privileges on the
    // immutable ledger. A duplicate waits for the first transaction before our first snapshot.
    const [claim] = await db.insert(s.dataImports).ignore().values({ name: "local-store-v1", digest, counts })
    if (!claim.affectedRows) {
      const [applied] = await db.select().from(s.dataImports).where(eq(s.dataImports.name, "local-store-v1"))
      if (!applied || applied.digest !== digest) throw new DomainError("conflict", "A different snapshot was already imported. Merchant data will not be overwritten.")
      return jsonValue<ImportCounts>(applied.counts)
    }
    for (const table of [s.products, s.orders, s.customers, s.staffMembers]) {
      const [row] = await db.select({ count: count() }).from(table)
      if (row.count !== 0) throw new DomainError("conflict", "The destination contains merchant records. Import requires an empty database.")
    }
    const store = source.stores[0]
    const storeValues = { name: store.name, defaultCurrency: store.defaultCurrency, orderPrefix: source.orderSequence.prefix, nextOrderNumber: source.orderSequence.next }
    await db.insert(s.stores).values({ id: store.id, ...storeValues }).onDuplicateKeyUpdate({ set: storeValues })
    await db.select({ id: s.stores.id }).from(s.stores).where(eq(s.stores.id, actor.storeId)).for("update")
    await db.insert(s.storeMetadata).values({ storeId: store.id, slug: store.slug, defaultLocale: store.defaultLocale }).onDuplicateKeyUpdate({ set: { slug: store.slug, defaultLocale: store.defaultLocale } })
    await db.insert(s.orderNumberSequences).values({ storeId: store.id, prefix: source.orderSequence.prefix, nextValue: source.orderSequence.next }).onDuplicateKeyUpdate({ set: { prefix: source.orderSequence.prefix, nextValue: source.orderSequence.next } })
    for (const row of source.adminPermissions) await db.insert(s.permissions).values({ ...row, sensitive: row.sensitive ? 1 : 0 }).onDuplicateKeyUpdate({ set: { label: row.label, group: row.group, sensitive: row.sensitive ? 1 : 0 } })
    for (const row of source.adminRoles) {
      const { permissions, ...rest } = row
      await db.insert(s.roles).values({ ...rest, isSystem: row.isSystem ? 1 : 0, createdAt: sqlDate(row.createdAt), updatedAt: sqlDate(row.updatedAt) })
      if (permissions.length) await db.insert(s.rolePermissions).values(permissions.map((permission) => ({ roleId: row.id, permission })))
    }
    for (const row of source.staffMembers) {
      const { recoveryCodes, ...rest } = row
      const role = source.staffRoles.find((legacy) => legacy.storeId === row.storeId && legacy.userId === row.userId)?.role ?? null
      await db.insert(s.staffMembers).values({ ...rest, role, email: row.email.trim().toLowerCase(), createdAt: sqlDate(row.createdAt), updatedAt: sqlDate(row.updatedAt), totpEnabledAt: nullableSqlDate(row.totpEnabledAt), lockedUntil: nullableSqlDate(row.lockedUntil), lastSeenAt: nullableSqlDate(row.lastSeenAt) })
      if (recoveryCodes.length) await db.insert(s.staffRecoveryCodes).values(recoveryCodes.map((value, position) => ({ userId: row.userId, storeId: row.storeId, value, position })))
    }
    if (source.staffRoleLinks.length) await db.insert(s.staffRoles).values(source.staffRoleLinks)
    for (const row of source.staffInvites) await db.insert(s.staffInvites).values({ ...row, createdAt: sqlDate(row.createdAt), expiresAt: sqlDate(row.expiresAt), acceptedAt: nullableSqlDate(row.acceptedAt), revokedAt: nullableSqlDate(row.revokedAt) })
    for (const row of source.staffSessions) await db.insert(s.staffSessions).values({ ...row, createdAt: sqlDate(row.createdAt), lastSeenAt: sqlDate(row.lastSeenAt), expiresAt: sqlDate(row.expiresAt), mfaAt: nullableSqlDate(row.mfaAt), revokedAt: nullableSqlDate(row.revokedAt) })
    for (const row of source.customers) {
      const { group, marketingOptIn, ...rest } = row
      await db.insert(s.customers).values({ ...rest, customerGroup: group, marketingOptIn: marketingOptIn ? 1 : 0, createdAt: sqlDate(row.createdAt), deletionRequestedAt: nullableSqlDate(row.deletionRequestedAt) })
    }
    for (const row of source.addresses) await db.insert(s.addresses).values({ ...row, line2: row.line2 ?? null, postalCode: row.postalCode ?? null, isDefault: row.isDefault ? 1 : 0 })
    for (const row of source.sessions) await db.insert(s.sessions).values({ ...row, createdAt: sqlDate(row.createdAt), expiresAt: sqlDate(row.expiresAt) })
    for (const row of source.passwordResets) await db.insert(s.passwordResets).values({ ...row, expiresAt: sqlDate(row.expiresAt), usedAt: nullableSqlDate(row.usedAt) })
    for (const row of source.brands) await db.insert(s.brands).values({ ...row, storeId: store.id })
    if (source.attributeDefinitions.length) await db.insert(s.attributeDefinitions).values(source.attributeDefinitions.map((row) => ({ ...row, storeId: store.id, options: row.options ?? null, filterable: row.filterable ? 1 : 0 })))
    if (source.customFieldDefinitions.length) await db.insert(s.customFieldDefinitions).values(source.customFieldDefinitions.map((row) => ({ ...row, storeId: store.id, required: row.required ? 1 : 0, visibleOnStorefront: row.visibleOnStorefront ? 1 : 0 })))
    for (const row of source.collections) await db.insert(s.collections).values(row)
    const catalog = createMysqlCatalogRepository()
    for (const row of source.products) {
      await catalog.saveProduct(actor, store.id, row, null)
      await db.update(s.products).set({ updatedAt: sqlDate(row.updatedAt ?? row.publishedAt), createdAt: sqlDate(row.publishedAt) }).where(eq(s.products.id, row.id))
    }
    for (const row of source.inventory) await db.insert(s.inventoryLevels).values(row).onDuplicateKeyUpdate({ set: { onHand: row.onHand, reserved: row.reserved } })
    for (const row of source.inventoryMovements) await db.insert(s.inventoryMovements).values({ ...row, at: sqlDate(row.at) })
    for (const row of source.priceLists) {
      const values = { ...row, storeId: store.id, startsAt: nullableSqlDate(row.startsAt), endsAt: nullableSqlDate(row.endsAt) }
      await db.insert(s.priceLists).values(values).onDuplicateKeyUpdate({ set: values })
    }
    if (source.prices.length) await db.insert(s.prices).values(source.prices)
    for (const row of source.shippingZones) {
      const { countries, cities, rates, ...rest } = row
      await db.insert(s.shippingZones).values({ ...rest, storeId: store.id })
      if (countries.length) await db.insert(s.shippingZoneCountries).values(countries.map((value, position) => ({ id: row.id, value, position })))
      if (cities.length) await db.insert(s.shippingZoneCities).values(cities.map((value, position) => ({ id: row.id, value, position })))
      if (rates.length) await db.insert(s.shippingRates).values(rates.map((rate) => ({ ...rate, id: uuidv7(), zoneId: row.id, cashOnDelivery: rate.cashOnDelivery ? 1 : 0 })))
    }
    for (const row of source.taxRates) await db.insert(s.taxRates).values({ ...row, id: uuidv7(), storeId: store.id, inclusive: row.inclusive ? 1 : 0 })
    for (const row of source.promotions) await db.insert(s.promotions).values({ ...row, active: row.active ? 1 : 0, combinable: row.combinable ? 1 : 0, startsAt: nullableSqlDate(row.startsAt), endsAt: nullableSqlDate(row.endsAt) })
    for (const row of source.carts) {
      const { lines, promotionCodes, ...rest } = row
      await db.insert(s.carts).values({ ...rest, createdAt: sqlDate(row.createdAt), updatedAt: sqlDate(row.updatedAt) })
      if (lines.length) await db.insert(s.cartLines).values(lines.map((line) => ({ ...line, cartId: row.id, addedAt: sqlDate(line.addedAt) })))
      if (promotionCodes.length) await db.insert(s.cartPromotionCodes).values(promotionCodes.map((value, position) => ({ id: row.id, value, position })))
    }
    for (const row of source.reservations) await db.insert(s.inventoryReservations).values({ ...row, expiresAt: sqlDate(row.expiresAt) })
    for (const row of source.orders) {
      const { lines, promotionCodes, ...rest } = row
      const checkout = source.carts.find((cart) => cart.status === "converted" && cart.customerId === row.customerId && cart.lines.length === lines.length && cart.lines.every((line) => lines.some((ordered) => ordered.variantId === line.variantId && ordered.quantity === line.quantity)))
      await db.insert(s.orders).values({ ...rest, checkoutCartId: checkout?.id ?? null, taxIncluded: row.taxIncluded ? 1 : 0, placedAt: sqlDate(row.placedAt), updatedAt: sqlDate(row.updatedAt) })
      if (lines.length) await db.insert(s.orderLines).values(lines.map((line, position) => {
        const returned = source.returns.filter((item) => item.orderId === row.id && item.status === "received").flatMap((item) => item.lines).filter((item) => item.orderLineId === line.id).reduce((sum, item) => sum + item.quantity, 0)
        const refunded = source.refunds.filter((item) => item.orderId === row.id && item.restock).flatMap((item) => item.lines).filter((item) => item.orderLineId === line.id).reduce((sum, item) => sum + item.quantity, 0)
        const restockedQuantity = row.status === "cancelled" ? line.quantity : Math.max(returned, refunded)
        return { ...line, orderId: row.id, position, restockedQuantity }
      }))
      if (promotionCodes.length) await db.insert(s.orderPromotionCodes).values(promotionCodes.map((value, position) => ({ id: row.id, value, position })))
      await db.insert(s.orderContacts).values({ orderId: row.id, storeId: store.id, recipientName: row.shippingAddress.fullName, phoneDigits: row.phone.replace(/\D/g, "") })
      await syncOrderSearch(db, actor, row.id)
    }
    for (const row of source.promotionRedemptions) await db.insert(s.promotionRedemptions).values({ ...row, id: uuidv7(), at: sqlDate(row.at) })
    for (const row of source.payments) await db.insert(s.payments).values({ ...row, createdAt: sqlDate(row.createdAt) })
    for (const row of source.refunds) await db.insert(s.refunds).values({ ...row, restock: row.restock ? 1 : 0, createdAt: sqlDate(row.createdAt) })
    for (const row of source.refundIntents ?? []) {
      requireStore(actor, row.storeId)
      await db.insert(s.refundIntents).values({ ...row, createdAt: sqlDate(row.createdAt) })
    }
    for (const row of source.returns) await db.insert(s.returns).values({ ...row, createdAt: sqlDate(row.createdAt) })
    for (const row of source.orderNotes) await db.insert(s.orderNotes).values({ ...row, createdAt: sqlDate(row.createdAt) })
    for (const row of source.media) await db.insert(s.media).values({ ...row, createdAt: sqlDate(row.createdAt) })
    if (source.home) await db.insert(s.storefrontContent).values({ storeId: store.id, content: source.home.content, updatedAt: sqlDate(source.home.updatedAt) })
    for (const row of source.pages) await db.insert(s.pages).values({ ...row, storeId: store.id, published: row.published !== false ? 1 : 0, updatedAt: sqlDate(row.updatedAt) })
    if (source.faqs.length) await db.insert(s.faqs).values(source.faqs.map((row) => ({ ...row, storeId: store.id })))
    for (const row of source.newsletter) await db.insert(s.newsletterSubscribers).values({ ...row, storeId: store.id, consentAt: sqlDate(row.consentAt) })
    for (const row of source.contactMessages) await db.insert(s.contactMessages).values({ ...row, storeId: store.id, createdAt: sqlDate(row.createdAt) })
    for (const row of source.searchSynonyms) {
      const { synonyms, ...rest } = row
      await db.insert(s.searchSynonyms).values({ ...rest, storeId: store.id })
      if (synonyms.length) await db.insert(s.searchSynonymValues).values(synonyms.map((value, position) => ({ id: row.id, value, position })))
    }
    for (const row of source.searchEvents) await db.insert(s.searchQueries).values({ ...row, storeId: store.id, createdAt: sqlDate(row.createdAt) })
    // The destination may contain only the minimal operating bootstrap at this point.
    await db.delete(s.featureFlags).where(eq(s.featureFlags.storeId, store.id))
    for (const row of source.flags) {
      await db.insert(s.featureFlags).values({ storeId: store.id, key: row.key, description: row.description, enabled: row.enabled ? 1 : 0, groupsRestricted: row.customerGroups !== undefined ? 1 : 0 })
      if (row.customerGroups?.length) await db.insert(s.featureFlagCustomerGroups).values(row.customerGroups.map((value, position) => ({ storeId: store.id, key: row.key, value, position })))
    }
    await db.insert(s.exchangeRates).values({ ...source.exchangeRates, storeId: store.id, updatedAt: sqlDate(source.exchangeRates.updatedAt) }).onDuplicateKeyUpdate({ set: { ...source.exchangeRates, updatedAt: sqlDate(source.exchangeRates.updatedAt) } })
    for (const row of source.outbox) await db.insert(s.outboxEvents).values({ ...row, payload: sealDeliveryPayload(row.payload, serverEnv.SESSION_SECRET), storeId: store.id, availableAt: sqlDate(row.availableAt), createdAt: sqlDate(row.createdAt) })
    for (const [key, row] of source.deliveryChannels ?? []) {
      const separator = key.indexOf(":"), eventId = key.slice(0, separator), channel = key.slice(separator + 1)
      if (separator !== 36 || !source.outbox.some((event) => event.id === eventId)) throw new DomainError("validation", "Delivery receipt does not belong to a preserved event.")
      await db.insert(s.outboxChannels).values({ eventId, channel, status: row.status, leaseToken: row.status === "sending" ? row.token : null, leaseUntil: row.leaseUntil ? sqlDate(new Date(row.leaseUntil).toISOString()) : null, deliveredAt: null })
    }
    for (const row of source.webhookDeliveries) await db.insert(s.webhookDeliveries).values({ ...row, at: sqlDate(row.at) })
    for (const row of source.audit) await db.insert(s.auditLog).values({ ...row, storeId: row.storeId ?? store.id, at: sqlDate(row.at) })
    for (const [key, row] of source.rateLimits) {
      const seconds = [60, 300, 600, 900].find((value) => Math.floor(Date.now() / (value * 1000)) === row.windowStart)
      const windowStart = seconds ? sqlDate(new Date(row.windowStart * seconds * 1000).toISOString()) : "1970-01-01 00:00:00.000"
      await db.insert(s.rateLimits).values({ key: createHash("sha256").update(store.id + ":" + key).digest("hex"), count: row.count, windowStart })
    }
    for (const [key, row] of source.idempotency) await db.insert(s.idempotencyKeys).values({ key: createHash("sha256").update(store.id + ":legacy:" + key).digest("hex"), status: row.status, body: row.body, createdAt: sqlDate(new Date(row.at).toISOString()), expiresAt: sqlDate(new Date(row.at + 86_400_000).toISOString()) })
    await syncCatalogueListing(db, actor, source.products.map((product) => product.id))
    return counts
  })
}

/** Return a stable, public-data comparison without exposing credential material in reports. */
export function timestampEquivalent(a: string, b: string): boolean { return isoDate(a) === isoDate(b) }
