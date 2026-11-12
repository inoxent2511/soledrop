import "server-only"

import { and, count, desc, eq } from "drizzle-orm"

import { adminService } from "@/server/admin"
import type { RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import { database, withTransaction } from "@/server/db/client"
import { currentStoreId, dataDriver } from "@/server/db/driver"
import { customerReviews, products } from "@/server/db/schema"
import { isoDate, sqlNow } from "@/server/db/values"
import { uuidv7 } from "@/server/db/uuid"
import { storage } from "@/server/adapters/storage"
import { processImage } from "@/server/media/service"
import { DomainError } from "@/server/shared/errors"
import { refreshStorefront } from "@/server/shared/revalidate"

export type ReviewStatus = "pending" | "approved" | "rejected"
export type Review = {
  id: string; productId: string | null; productTitle: string | null; displayName: string
  rating: number; title: string; body: string; imageCount: number; status: ReviewStatus
  featured: boolean; createdAt: string
}
export type ReviewSummary = { total: number; average: number; counts: Record<1 | 2 | 3 | 4 | 5, number> }
type ReviewRow = typeof customerReviews.$inferSelect
type Submission = { displayName: string; email: string; rating: number; title: string; body: string; productId: string | null; images: File[] }

const local = globalThis as typeof globalThis & { __soledropReviews?: ReviewRow[] }
const localRows = () => local.__soledropReviews ??= []
const keys = (row: ReviewRow): string[] => Array.isArray(row.imageKeys) ? row.imageKeys.filter((key): key is string => typeof key === "string") : []
const view = (row: ReviewRow, productTitle: string | null): Review => ({
  id: row.id, productId: row.productId, productTitle, displayName: row.displayName,
  rating: row.rating, title: row.title, body: row.body, imageCount: keys(row).length,
  status: row.status as ReviewStatus, featured: Boolean(row.featured), createdAt: isoDate(row.createdAt),
})
const summary = (rows: { rating: number; count: number }[]): ReviewSummary => {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const row of rows) if (row.rating >= 1 && row.rating <= 5) counts[row.rating as 1 | 2 | 3 | 4 | 5] = Number(row.count)
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  return { total, average: total ? Object.entries(counts).reduce((sum, [rating, count]) => sum + Number(rating) * count, 0) / total : 0, counts }
}

export async function reviewProducts(): Promise<{ id: string; title: string }[]> {
  if (dataDriver() !== "mysql") return []
  const db = await database()
  return db.select({ id: products.id, title: products.title }).from(products)
    .where(and(eq(products.storeId, currentStoreId()), eq(products.status, "active")))
    .orderBy(products.title).limit(200)
}

export async function publicReviews(page = 1, pageSize = 12): Promise<{ items: Review[]; summary: ReviewSummary; pages: number }> {
  const storeId = currentStoreId()
  if (dataDriver() !== "mysql") {
    const rows = localRows().filter((row) => row.storeId === storeId && row.status === "approved").sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { items: rows.slice((page - 1) * pageSize, page * pageSize).map((row) => view(row, null)), summary: summary([1, 2, 3, 4, 5].map((rating) => ({ rating, count: rows.filter((row) => row.rating === rating).length }))), pages: Math.max(1, Math.ceil(rows.length / pageSize)) }
  }
  const db = await database()
  const where = and(eq(customerReviews.storeId, storeId), eq(customerReviews.status, "approved"))
  const [ratingRows, rows] = await Promise.all([
    db.select({ rating: customerReviews.rating, count: count() }).from(customerReviews).where(where).groupBy(customerReviews.rating),
    db.select({ review: customerReviews, productTitle: products.title }).from(customerReviews)
      .leftJoin(products, and(eq(customerReviews.productId, products.id), eq(products.storeId, storeId)))
      .where(where).orderBy(desc(customerReviews.featured), desc(customerReviews.createdAt), desc(customerReviews.id))
      .limit(pageSize).offset((page - 1) * pageSize),
  ])
  const stats = summary(ratingRows)
  return { items: rows.map(({ review, productTitle }) => view(review, productTitle)), summary: stats, pages: Math.max(1, Math.ceil(stats.total / pageSize)) }
}

export async function staffReviews(storeId: string, status: ReviewStatus | "all" = "pending"): Promise<Review[]> {
  if (dataDriver() !== "mysql") return localRows().filter((row) => row.storeId === storeId && (status === "all" || row.status === status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((row) => view(row, null))
  const db = await database()
  const rows = await db.select({ review: customerReviews, productTitle: products.title }).from(customerReviews)
    .leftJoin(products, and(eq(customerReviews.productId, products.id), eq(products.storeId, storeId)))
    .where(and(eq(customerReviews.storeId, storeId), status === "all" ? undefined : eq(customerReviews.status, status)))
    .orderBy(desc(customerReviews.createdAt), desc(customerReviews.id)).limit(200)
  return rows.map(({ review, productTitle }) => view(review, productTitle))
}

export async function submitReview(input: Submission): Promise<void> {
  const storeId = currentStoreId(), id = uuidv7(), saved: string[] = []
  if (input.productId && dataDriver() === "mysql") {
    const db = await database()
    const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.storeId, storeId), eq(products.id, input.productId), eq(products.status, "active"))).limit(1)
    if (!product) throw new DomainError("validation", "Choose a product from the list or leave it blank.")
  }
  try {
    for (const [index, file] of input.images.entries()) {
      const processed = await processImage(new Uint8Array(await file.arrayBuffer()))
      const key = `reviews/${storeId}/${id}/${index}.webp`
      await storage().put(key, processed.data)
      saved.push(key)
    }
    const row = { id, storeId, productId: input.productId, displayName: input.displayName, email: input.email.toLowerCase(), rating: input.rating, title: input.title, body: input.body, imageKeys: saved, status: "pending", featured: 0, createdAt: sqlNow(), moderatedAt: null, moderatedBy: null }
    if (dataDriver() === "mysql") await (await database()).insert(customerReviews).values(row)
    else localRows().push(row)
  } catch (error) {
    await Promise.all(saved.map((key) => storage().remove(key).catch(() => undefined)))
    throw error
  }
}

export async function moderateReview(staff: StaffContext, meta: RequestMeta, id: string, action: "approve" | "reject" | "feature" | "unfeature"): Promise<void> {
  if (!staff.permissions.includes("reviews:write") || staff.session.aal !== 2) throw new DomainError("forbidden", "You don't have permission to manage reviews.")
  const storeId = staff.member.storeId
  if (dataDriver() !== "mysql") {
    const row = localRows().find((item) => item.id === id && item.storeId === storeId)
    if (!row) throw new DomainError("not_found", "Review not found.")
    if (action === "feature" && row.status !== "approved") throw new DomainError("validation", "Approve this review before featuring it.")
    if (action === "approve" || action === "reject") { row.status = action === "approve" ? "approved" : "rejected"; row.featured = 0 }
    else row.featured = action === "feature" ? 1 : 0
    refreshStorefront()
    return
  }
  await withTransaction(async (db) => {
    const where = and(eq(customerReviews.storeId, storeId), eq(customerReviews.id, id))
    const [before] = await db.select().from(customerReviews).where(where).for("update")
    if (!before) throw new DomainError("not_found", "Review not found.")
    if (action === "feature" && before.status !== "approved") throw new DomainError("validation", "Approve this review before featuring it.")
    const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : before.status
    const featured = action === "feature" ? 1 : action === "unfeature" || action === "reject" ? 0 : before.featured
    await db.update(customerReviews).set({ status, featured, moderatedAt: sqlNow(), moderatedBy: staff.member.userId }).where(where)
    await adminService().recordAudit(staff, meta, { action: `review.${action}`, entity: "customer_review", entityId: id, before: { status: before.status, featured: Boolean(before.featured) }, after: { status, featured: Boolean(featured) }, storeId })
    refreshStorefront()
  })
}

export async function approvedReviewImage(id: string, index: number): Promise<Uint8Array | null> {
  const storeId = currentStoreId()
  const row = dataDriver() === "mysql"
    ? (await (await database()).select({ imageKeys: customerReviews.imageKeys }).from(customerReviews).where(and(eq(customerReviews.storeId, storeId), eq(customerReviews.id, id), eq(customerReviews.status, "approved"))).limit(1))[0]
    : localRows().find((item) => item.storeId === storeId && item.id === id && item.status === "approved")
  if (!row) return null
  const imageKeys = Array.isArray(row.imageKeys) ? row.imageKeys : []
  const key = imageKeys[index]
  if (typeof key !== "string" || !key.startsWith(`reviews/${storeId}/${id}/`)) return null
  return (await storage().get(key))?.data ?? null
}

export async function staffReviewImage(storeId: string, id: string, index: number): Promise<Uint8Array | null> {
  const row = dataDriver() === "mysql"
    ? (await (await database()).select({ imageKeys: customerReviews.imageKeys }).from(customerReviews).where(and(eq(customerReviews.storeId, storeId), eq(customerReviews.id, id))).limit(1))[0]
    : localRows().find((item) => item.storeId === storeId && item.id === id)
  if (!row) return null
  const imageKeys = Array.isArray(row.imageKeys) ? row.imageKeys : []
  const key = imageKeys[index]
  if (typeof key !== "string" || !key.startsWith(`reviews/${storeId}/${id}/`)) return null
  return (await storage().get(key))?.data ?? null
}
