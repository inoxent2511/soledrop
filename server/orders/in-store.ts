import "server-only"

import { createHash } from "node:crypto"
import { and, asc, desc, eq, gt, inArray, like, or, sql } from "drizzle-orm"

import type { SaleInput } from "@/features/admin/in-store/schema"
import { pricing } from "@/server/pricing"
import { shippingRepository, taxFor, taxRateFor } from "@/server/shipping"
import { type StaffContext } from "@/server/admin/types"
import { staffActor, requireGrant } from "@/server/db/actor"
import { database, withTransaction } from "@/server/db/client"
import { brands, inventoryLevels, inventoryMovements, orderContacts, orderLines, orders, payments, productImages, products, variants } from "@/server/db/schema"
import { isoDate, sqlDate } from "@/server/db/values"
import { uuidv7 } from "@/server/db/uuid"
import { lockLevels, lockStore, releaseExpiredReservations } from "@/server/inventory/mysql.repository"
import { allocateNumber, auditOrder } from "@/server/orders/mysql-helpers.repository"
import { syncOrderSearch } from "@/server/orders/search-index.repository"
import { allocate } from "@/server/shared/money"
import { DomainError } from "@/server/shared/errors"
import { refreshStorefront } from "@/server/shared/revalidate"

const posCode = "in_store"
const moneyLimit = 100_000_000_00 // Rs. 100 million, in paisa

type SaleLine = {
  variantId: string; productId: string; slug: string; title: string; brand: string
  kind: "new" | "preloved"; condition: string | null; conditionNotes: string | null; sku: string
  size: { eu: string; uk: string; us: string }; quantity: number; unitPrice: number
  compareAt: number | null; imageUrl: string
}

function quoteSignature(quote: Awaited<ReturnType<typeof calculate>>) {
  return createHash("sha256").update(JSON.stringify({ lines: quote.lines.map((line) => [line.variantId, line.quantity, line.unitPrice, line.kind, line.condition, line.conditionNotes]),
    subtotal: quote.subtotal, discount: quote.discount, tax: quote.tax, taxIncluded: quote.taxIncluded, total: quote.total })).digest("hex")
}

async function calculate(staff: StaffContext, input: SaleInput) {
  const actor = staffActor(staff)
  requireGrant(actor, "orders:write")
  requireGrant(actor, "orders:mark_paid")
  requireGrant(actor, "inventory:adjust")
  const ids = input.items.map((item) => item.variantId)
  const db = await database()
  const rows = await db.select({
    variantId: variants.id, productId: products.id, slug: products.slug, title: products.title,
    brand: brands.name, kind: products.kind, condition: products.conditionGrade, conditionNotes: products.conditionNotes,
    sku: variants.sku, eu: variants.sizeEu, uk: variants.sizeUk, us: variants.sizeUs,
    onHand: inventoryLevels.onHand, reserved: inventoryLevels.reserved,
  }).from(variants).innerJoin(products, eq(products.id, variants.productId))
    .innerJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(inventoryLevels, eq(inventoryLevels.variantId, variants.id))
    .where(and(eq(products.storeId, actor.storeId), eq(products.status, "active"), inArray(variants.id, ids)))
  if (rows.length !== ids.length) throw new DomainError("validation", "A selected size is unavailable. Search again.")
  const prices = await pricing().pricesFor(ids, { storeId: actor.storeId, customerGroup: null })
  const pictures = await db.select({ productId: productImages.productId, url: productImages.url }).from(productImages)
    .where(inArray(productImages.productId, rows.map((row) => row.productId))).orderBy(asc(productImages.position), productImages.id)
  const lines: SaleLine[] = input.items.map((item) => {
    const row = rows.find((entry) => entry.variantId === item.variantId)!
    const price = prices.get(item.variantId)
    if (!price || price.currency !== "PKR" || price.amount <= 0) throw new DomainError("validation", "A selected size has no PKR selling price.")
    if (row.onHand - row.reserved < item.quantity) throw new DomainError("out_of_stock", `${row.brand} ${row.title} (EU ${row.eu}) has only ${Math.max(0, row.onHand - row.reserved)} available.`)
    return { variantId: row.variantId, productId: row.productId, slug: row.slug, title: row.title, brand: row.brand,
      kind: row.kind as SaleLine["kind"], condition: row.condition, conditionNotes: row.conditionNotes, sku: row.sku,
      size: { eu: row.eu, uk: row.uk, us: row.us }, quantity: item.quantity,
      unitPrice: price.amount, compareAt: price.compareAt,
      imageUrl: pictures.find((picture) => picture.productId === row.productId)?.url ?? "" }
  })
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
  if (!Number.isSafeInteger(subtotal) || subtotal > moneyLimit || input.discountMinor > subtotal) throw new DomainError("validation", "The discount or sale total is invalid.")
  const taxable = subtotal - input.discountMinor
  const rates = await shippingRepository().listTaxRates(actor.storeId)
  const rate = taxRateFor(rates, "PK", input.province || undefined)
  if (!rate && rates.some((entry) => entry.country === "PK")) throw new DomainError("validation", "Select the shop province used for tax on this sale.")
  const tax = taxFor(taxable, rate)
  const total = taxable + (tax.inclusive ? 0 : tax.tax)
  if (!Number.isSafeInteger(total) || total > moneyLimit) throw new DomainError("validation", "The sale total is too large.")
  if (input.paymentMethod === "cash" && input.tenderedMinor < total) throw new DomainError("validation", "Cash received must cover the total.")
  return { lines, subtotal, discount: input.discountMinor, tax: tax.tax, taxIncluded: tax.inclusive, total,
    taxLabel: rate?.label ?? null, change: input.paymentMethod === "cash" ? input.tenderedMinor - total : 0 }
}

export async function searchInStoreProducts(staff: StaffContext, query: string, kind?: "new" | "preloved") {
  const actor = staffActor(staff)
  requireGrant(actor, "orders:write")
  requireGrant(actor, "products:read")
  const db = await database()
  const term = query.trim().slice(0, 80).replace(/[\\%_]/g, "\\$&")
  const pattern = `%${term}%`
  const rows = await db.select({
    variantId: variants.id, productId: products.id, brand: brands.name, title: products.title,
    kind: products.kind, condition: products.conditionGrade, conditionNotes: products.conditionNotes, sku: variants.sku,
    eu: variants.sizeEu, uk: variants.sizeUk, onHand: inventoryLevels.onHand, reserved: inventoryLevels.reserved,
  }).from(variants).innerJoin(products, eq(products.id, variants.productId))
    .innerJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(inventoryLevels, eq(inventoryLevels.variantId, variants.id))
    .where(and(eq(products.storeId, actor.storeId), eq(products.status, "active"), kind ? eq(products.kind, kind) : undefined,
      gt(inventoryLevels.available, 0), term ? or(like(products.title, pattern), like(brands.name, pattern), like(variants.sku, pattern)) : undefined))
    .orderBy(asc(products.title), asc(variants.sizeEu)).limit(40)
  const prices = await pricing().pricesFor(rows.map((row) => row.variantId), { storeId: actor.storeId, customerGroup: null })
  return rows.flatMap((row) => {
    const price = prices.get(row.variantId)
    return price?.currency === "PKR" ? [{ variantId: row.variantId, productId: row.productId, brand: row.brand,
      title: row.title, kind: row.kind, condition: row.condition, conditionNotes: row.conditionNotes, sku: row.sku, eu: row.eu, uk: row.uk,
      available: row.onHand - row.reserved, unitPrice: price.amount }] : []
  })
}

export async function quoteInStoreSale(staff: StaffContext, input: SaleInput) {
  const result = await calculate(staff, input)
  return { lines: result.lines.map(({ variantId, brand, title, kind, condition, conditionNotes, size, quantity, unitPrice }) => ({ variantId, brand, title, kind, condition, conditionNotes, size, quantity, unitPrice })),
    subtotal: result.subtotal, discount: result.discount, tax: result.tax, taxIncluded: result.taxIncluded,
    taxLabel: result.taxLabel, total: result.total, change: result.change, fingerprint: quoteSignature(result) }
}

export async function createInStoreSale(staff: StaffContext, input: SaleInput) {
  if (input.expectedTotalMinor === undefined || !input.expectedQuote) throw new DomainError("validation", "Review the sale total before recording payment.")
  const actor = staffActor(staff)
  requireGrant(actor, "orders:write")
  requireGrant(actor, "orders:mark_paid")
  requireGrant(actor, "inventory:adjust")
  const key = `in-store:${input.idempotencyKey}`
  const result = await withTransaction(async (db) => {
    await lockStore(db, actor)
    const [existing] = await db.select({ number: orders.number, shippingMethod: orders.shippingMethod })
      .from(orders).where(and(eq(orders.storeId, actor.storeId), eq(orders.idempotencyKey, key))).limit(1)
    if (existing) {
      if ((existing.shippingMethod as { code?: string }).code !== posCode) throw new DomainError("conflict", "This sale key belongs to another order.")
      return { number: existing.number, replayed: true }
    }
    await releaseExpiredReservations(db, actor, 500, input.items.map((item) => item.variantId))
    const quote = await calculate(staff, input)
    if (quote.total !== input.expectedTotalMinor || quoteSignature(quote) !== input.expectedQuote) throw new DomainError("conflict", "The price or tax changed. Review the sale again.")
    const levels = await lockLevels(db, actor, input.items.map((item) => item.variantId))
    for (const line of quote.lines) {
      const level = levels.find((row) => row.variantId === line.variantId)
      if (!level || level.onHand - level.reserved < line.quantity) throw new DomainError("out_of_stock", `${line.brand} ${line.title} (EU ${line.size.eu}) is no longer available in that quantity.`)
    }
    const number = await allocateNumber(db, actor)
    const id = uuidv7()
    const at = new Date().toISOString()
    const name = input.customerName || "Walk-in customer"
    const email = input.customerEmail.toLowerCase() || `walkin-${id}@soledrop.invalid`
    const discounts = allocate(quote.discount, quote.lines.map((line) => line.unitPrice * line.quantity))
    const net = quote.lines.map((line, i) => line.unitPrice * line.quantity - discounts[i])
    const taxes = allocate(quote.tax, net)
    await db.insert(orders).values({ id, storeId: actor.storeId, number, customerId: null, email,
      phone: input.customerPhone, status: "delivered", paymentStatus: "paid", fulfillmentStatus: "fulfilled", currency: "PKR",
      subtotal: quote.subtotal, discountTotal: quote.discount, shippingTotal: 0, taxTotal: quote.tax,
      taxIncluded: quote.taxIncluded ? 1 : 0, total: quote.total, refundedTotal: 0,
      shippingAddress: { fullName: name, phone: input.customerPhone, line1: "In-store handover", city: "", province: input.province, country: "PK" },
      shippingMethod: { code: posCode, label: "Collected in store", amount: 0, minDays: 0, maxDays: 0 },
      paymentMethod: input.paymentMethod, idempotencyKey: key, accessTokenHash: "",
      customFields: { saleChannel: "in_store", shopAddress: input.shopAddress, policyShown: true,
        ...Object.fromEntries(quote.lines.filter((line) => line.kind === "preloved" && line.conditionNotes).map((line) => [`condition:${line.variantId}`, line.conditionNotes!])),
        tenderedMinor: input.paymentMethod === "cash" ? input.tenderedMinor : 0, changeMinor: quote.change },
      note: null, trackingNumber: null, history: [{ from: null, to: "delivered", at, actor: `staff:${actor.id}`, note: "Paid and handed over in store" }],
      placedAt: sqlDate(at), updatedAt: sqlDate(at) })
    await db.insert(orderContacts).values({ orderId: id, storeId: actor.storeId, recipientName: name,
      phoneDigits: input.customerPhone.replace(/\D/g, "") })
    for (let i = 0; i < quote.lines.length; i++) {
      const line = quote.lines[i]
      await db.insert(orderLines).values({ id: uuidv7(), orderId: id, variantId: line.variantId, productId: line.productId,
        slug: line.slug, title: line.title, brand: line.brand, kind: line.kind, condition: line.condition,
        size: line.size, imageUrl: line.imageUrl, sku: line.sku, quantity: line.quantity,
        unitPrice: line.unitPrice, compareAt: line.compareAt, discount: discounts[i], tax: taxes[i], total: net[i], position: i })
      const level = levels.find((row) => row.variantId === line.variantId)!
      await db.update(inventoryLevels).set({ onHand: level.onHand - line.quantity, updatedAt: sqlDate(at) }).where(eq(inventoryLevels.variantId, line.variantId))
      await db.insert(inventoryMovements).values({ id: uuidv7(), variantId: line.variantId, delta: -line.quantity,
        reason: `In-store sale ${number}`, actor: `staff:${actor.id}`, at: sqlDate(at) })
    }
    await db.insert(payments).values({ id: uuidv7(), orderId: id, provider: input.paymentMethod,
      status: "captured", amount: quote.total, refundedAmount: 0, currency: "PKR",
      providerRef: input.paymentReference || null, idempotencyKey: key, createdAt: sqlDate(at) })
    await syncOrderSearch(db, actor, id)
    await auditOrder(db, actor, "order.in_store_created", "order", id, null,
      { number, items: quote.lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })), total: quote.total, paymentMethod: input.paymentMethod })
    return { number, replayed: false }
  }, { retries: 3, idempotencyKey: key })
  if (!result.replayed) refreshStorefront()
  return result
}

export async function recentInStoreSales(staff: StaffContext) {
  const actor = staffActor(staff)
  requireGrant(actor, "orders:read")
  const db = await database()
  const rows = await db.select({ number: orders.number, placedAt: orders.placedAt, total: orders.total,
    name: orders.shippingAddress, paymentMethod: orders.paymentMethod }).from(orders)
    .where(and(eq(orders.storeId, actor.storeId), sql`JSON_UNQUOTE(JSON_EXTRACT(${orders.shippingMethod}, '$.code')) = ${posCode}`))
    .orderBy(desc(orders.placedAt), desc(orders.id)).limit(20)
  return rows.map((row) => ({ number: row.number, placedAt: isoDate(row.placedAt), total: row.total,
    customer: (row.name as { fullName?: string }).fullName ?? "Walk-in customer", paymentMethod: row.paymentMethod }))
}
