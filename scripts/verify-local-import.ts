import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { deserialize } from "node:v8"
import { ALL_PERMISSIONS } from "@/server/admin/permissions"
import { systemActor } from "@/server/db/actor"
import { closeDatabase } from "@/server/db/client"
import { createMysqlAdminRepository } from "@/server/admin/mysql.repository"
import { createMysqlCatalogRepository } from "@/server/catalog/mysql.repository"
import { createMysqlContentRepository } from "@/server/content/mysql.repository"
import { createMysqlInventoryRepository } from "@/server/inventory/mysql.repository"
import { createMysqlMediaRepository } from "@/server/media/mysql.repository"
import { createMysqlOrderRepository } from "@/server/orders/mysql.repository"
import { createMysqlPlatformRepository } from "@/server/platform/mysql.repository"
import { createMysqlPricingRepository } from "@/server/pricing/mysql.repository"
import { createMysqlShippingRepository } from "@/server/shipping/mysql.repository"
import { createMysqlSearchRepository } from "@/server/search/mysql.repository"
import { LocalDiskStorage } from "@/server/adapters/storage/local-disk"
import type { FixtureTables } from "@/server/fixtures/tables"

if (!process.argv[2] || !process.env.DATABASE_URL || !process.env.STORAGE_DIR) throw new Error("Provide source directory, local DATABASE_URL and STORAGE_DIR")
const url = new URL(process.env.DATABASE_URL)
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Preservation verification is local only")
const directory = path.resolve(process.argv[2])
const envelope = deserialize(await fs.readFile(path.join(directory, "store.bin"))) as { state: Buffer; digest: string }
if (createHash("sha256").update(envelope.state).digest("hex") !== envelope.digest) throw new Error("Source digest mismatch")
const source = deserialize(envelope.state) as FixtureTables
const actor = systemActor(source.stores[0].id, "migration", ALL_PERMISSIONS), storeId = actor.storeId
const failures: string[] = []
let checks = 0
function check(expected: unknown, actual: unknown, label: string) {
  if (expected === undefined) return
  checks++
  if (expected === null || typeof expected !== "object") { if (expected !== actual) failures.push(label); return }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) { failures.push(label + ".length"); return }
    expected.forEach((value, index) => check(value, actual[index], label + "[" + index + "]"))
    return
  }
  const record = actual && typeof actual === "object" ? actual as Record<string, unknown> : {}
  for (const [key, value] of Object.entries(expected)) check(value, record[key], label + "." + key)
}
const catalog = createMysqlCatalogRepository(), admin = createMysqlAdminRepository(), orders = createMysqlOrderRepository(), inventory = createMysqlInventoryRepository(), pricing = createMysqlPricingRepository(), content = createMysqlContentRepository(), media = createMysqlMediaRepository(), platform = createMysqlPlatformRepository(), shipping = createMysqlShippingRepository(), search = createMysqlSearchRepository()
try {
  for (const row of source.products) check(row, await catalog.getProductById(actor, storeId, row.id), "product:" + row.id)
  const collections = await catalog.listCollections(actor, storeId)
  for (const row of source.collections) check(row, collections.find((value) => value.id === row.id), "collection:" + row.id)
  const members = await admin.listMembers(actor, storeId), roles = await admin.listRoles(actor, storeId)
  for (const row of source.staffMembers) {
    check(row, members.find((value) => value.userId === row.userId), "staff:" + row.userId)
    const sessions = await admin.listSessions(actor, storeId, row.userId)
    for (const session of source.staffSessions.filter((value) => value.userId === row.userId)) check(session, sessions.find((value) => value.id === session.id), "staff-session:" + session.id)
  }
  for (const row of source.adminRoles) { const actual = roles.find((value) => value.id === row.id); check({ ...row, permissions: [...row.permissions].sort() }, actual ? { ...actual, permissions: [...actual.permissions].sort() } : null, "role:" + row.id) }
  const invites = await admin.listInvites(actor, storeId)
  for (const row of source.staffInvites) check(row, invites.find((value) => value.id === row.id), "invite:" + row.id)
  for (const row of source.orders) {
    check(row, await orders.findById(actor, row.id), "order:" + row.id)
    const payments = await orders.listPayments(actor, row.id), refunds = await orders.listRefunds(actor, row.id), returns = await orders.listReturns(actor, row.id), notes = await orders.listNotes(actor, row.id)
    for (const payment of source.payments.filter((value) => value.orderId === row.id)) check(payment, payments.find((value) => value.id === payment.id), "payment:" + payment.id)
    for (const refund of source.refunds.filter((value) => value.orderId === row.id)) check(refund, refunds.find((value) => value.id === refund.id), "refund:" + refund.id)
    for (const request of source.returns.filter((value) => value.orderId === row.id)) check(request, returns.find((value) => value.id === request.id), "return:" + request.id)
    for (const note of source.orderNotes.filter((value) => value.orderId === row.id)) check(note, notes.find((value) => value.id === note.id), "note:" + note.id)
  }
  const ids = source.products.flatMap((row) => row.variants.map((variant) => variant.id)), prices = await pricing.listPrices(actor, ids), levels = await inventory.levels(actor, ids), movements = await inventory.movements(actor, ids, 1000)
  for (const row of source.prices) check(row, prices.find((value) => value.variantId === row.variantId && value.priceListId === row.priceListId), "price:" + row.variantId)
  for (const row of source.inventory) check(row, levels.find((value) => value.variantId === row.variantId), "stock:" + row.variantId)
  for (const row of source.inventoryMovements) check(row, movements.find((value) => value.id === row.id), "movement:" + row.id)
  check(source.exchangeRates, await pricing.getExchangeRates(actor, storeId), "exchange-rates")
  check(source.home, await content.home(actor, storeId), "home")
  const pages = await content.staffPages(actor, storeId), faqs = await content.listFaqs(actor, storeId), flags = await platform.listFlags(actor, storeId), synonyms = await search.listSynonyms(actor, storeId)
  for (const row of source.pages) check(row, pages.find((value) => value.slug === row.slug), "page:" + row.slug)
  for (const row of source.faqs) check(row, faqs.find((value) => value.id === row.id), "faq:" + row.id)
  for (const row of source.flags) check(row, flags.find((value) => value.key === row.key), "flag:" + row.key)
  for (const row of source.searchSynonyms) check(row, synonyms.find((value) => value.id === row.id), "synonym:" + row.id)
  check(source.shippingZones, await shipping.listZones(actor, storeId), "shipping-zones")
  check(source.taxRates, await shipping.listTaxRates(actor, storeId), "tax-rates")
  const storage = new LocalDiskStorage(process.env.STORAGE_DIR)
  for (const row of source.media) {
    check(row, await media.find(actor, storeId, row.id), "media:" + row.id)
    const original = await fs.readFile(path.join(directory, "media", createHash("sha256").update(row.path).digest("hex") + ".webp")), actual = await storage.get(row.path)
    check(createHash("sha256").update(original).digest("hex"), actual?.etag, "image-bytes:" + row.id)
  }
  // Reports contain only paths/counts; password/session/MFA material is compared in memory.
  process.stdout.write(JSON.stringify({ sourceDigest: envelope.digest, checks, differences: failures, products: source.products.length, media: source.media.length, staff: source.staffMembers.length, staffSessions: source.staffSessions.length, orders: source.orders.length }) + "\n")
  if (failures.length) process.exitCode = 1
} finally { await closeDatabase() }
