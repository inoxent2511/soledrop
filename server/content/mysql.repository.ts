import "server-only"

import { and, asc, count, desc, eq } from "drizzle-orm"
import type { ContentRepository } from "./repository"
import type { HomeContent } from "./home-types"
import type { Page, NewsletterSubscriber } from "./types"
import { type ActorScoped, requireGrant, requireStore, requireSystem } from "@/server/db/actor"
import { database, withTransaction } from "@/server/db/client"
import { contactMessages, faqs, newsletterSubscribers, pages, storefrontContent, stores } from "@/server/db/schema"
import { isoDate, jsonValue, sqlDate } from "@/server/db/values"
import { DomainError } from "@/server/shared/errors"

function page(row: typeof pages.$inferSelect): Page {
  return { slug: row.slug, title: row.title, description: row.description, blocks: jsonValue<Page["blocks"]>(row.blocks), seo: jsonValue<Page["seo"]>(row.seo), updatedAt: isoDate(row.updatedAt), published: row.published === 1 }
}

export function createMysqlContentRepository(): ActorScoped<ContentRepository> {
  return {
    async home(actor, storeId) {
      requireStore(actor, storeId)
      const db = await database()
      const [row] = await db.select().from(storefrontContent).where(eq(storefrontContent.storeId, actor.storeId)).limit(1)
      return row ? { content: jsonValue<HomeContent>(row.content), updatedAt: isoDate(row.updatedAt) } : null
    },
    async saveHome(actor, storeId, content, expectedUpdatedAt) {
      requireStore(actor, storeId); requireGrant(actor, "content:write")
      return withTransaction(async (db) => {
        await db.select({ id: stores.id }).from(stores).where(eq(stores.id, actor.storeId)).for("update")
        const [row] = await db.select().from(storefrontContent).where(eq(storefrontContent.storeId, actor.storeId)).for("update")
        if ((row ? isoDate(row.updatedAt) : null) !== expectedUpdatedAt) throw new DomainError("conflict", "Someone else saved the homepage. Reload before saving.")
        const updatedAt = new Date(Math.max(Date.now(), row ? Date.parse(isoDate(row.updatedAt)) + 1 : 0)).toISOString()
        if (row) await db.update(storefrontContent).set({ content, updatedAt: sqlDate(updatedAt) }).where(eq(storefrontContent.storeId, actor.storeId))
        else await db.insert(storefrontContent).values({ storeId, content, updatedAt: sqlDate(updatedAt) })
        return { content: structuredClone(content), updatedAt }
      })
    },
    async listPages(actor, storeId) {
      requireStore(actor, storeId)
      const db = await database()
      return (await db.select().from(pages).where(and(eq(pages.storeId, actor.storeId), eq(pages.published, 1)))).map(page)
    },
    async getPage(actor, storeId, slug) {
      requireStore(actor, storeId)
      const db = await database()
      const [row] = await db.select().from(pages).where(and(eq(pages.storeId, actor.storeId), eq(pages.slug, slug), eq(pages.published, 1))).limit(1)
      return row ? page(row) : null
    },
    async listFaqs(actor, storeId) {
      requireStore(actor, storeId)
      const db = await database()
      return db.select({ id: faqs.id, category: faqs.category, question: faqs.question, answer: faqs.answer, position: faqs.position }).from(faqs).where(eq(faqs.storeId, actor.storeId)).orderBy(asc(faqs.position))
    },
    async subscribe(actor, storeId, subscriber) {
      requireStore(actor, storeId)
      return withTransaction(async (db) => {
        const email = subscriber.email.trim().toLowerCase()
        // Locking the store also serializes simultaneous subscriptions of a missing email.
        await db.select({ id: stores.id }).from(stores).where(eq(stores.id, actor.storeId)).for("update")
        const where = and(eq(newsletterSubscribers.storeId, actor.storeId), eq(newsletterSubscribers.email, email))
        const [row] = await db.select({ status: newsletterSubscribers.status }).from(newsletterSubscribers).where(where).for("update")
        if (row?.status === "subscribed") return false
        const values = { source: subscriber.source, status: subscriber.status, consentAt: sqlDate(subscriber.consentAt) }
        if (row) await db.update(newsletterSubscribers).set(values).where(where)
        else await db.insert(newsletterSubscribers).values({ storeId, email, ...values })
        return true
      })
    },
    async unsubscribe(actor, storeId, email) {
      requireStore(actor, storeId); requireSystem(actor, ["auth:customer", "migration"])
      const db = await database()
      await db.update(newsletterSubscribers).set({ status: "unsubscribed" }).where(and(eq(newsletterSubscribers.storeId, actor.storeId), eq(newsletterSubscribers.email, email.trim().toLowerCase())))
    },
    async saveContactMessage(actor, storeId, message) {
      requireStore(actor, storeId)
      const db = await database()
      await db.insert(contactMessages).values({ ...message, storeId, email: message.email.trim().toLowerCase(), createdAt: sqlDate(message.createdAt) })
    },
    async staffPages(actor, storeId) {
      requireStore(actor, storeId); requireGrant(actor, "content:read")
      const db = await database()
      return (await db.select().from(pages).where(eq(pages.storeId, actor.storeId))).map(page)
    },
    async staffPage(actor, storeId, slug) {
      requireStore(actor, storeId); requireGrant(actor, "content:read")
      const db = await database()
      const [row] = await db.select().from(pages).where(and(eq(pages.storeId, actor.storeId), eq(pages.slug, slug))).limit(1)
      return row ? page(row) : null
    },
    async savePage(actor, storeId, input, previousSlug, expectedUpdatedAt) {
      requireStore(actor, storeId); requireGrant(actor, "content:write")
      return withTransaction(async (db) => {
        await db.select({ id: stores.id }).from(stores).where(eq(stores.id, actor.storeId)).for("update")
        const previousWhere = and(eq(pages.storeId, actor.storeId), eq(pages.slug, previousSlug ?? input.slug))
        const [row] = previousSlug ? await db.select().from(pages).where(previousWhere).for("update") : []
        if (previousSlug && !row) throw new DomainError("not_found", "Page not found.")
        if (row && expectedUpdatedAt && isoDate(row.updatedAt) !== expectedUpdatedAt) throw new DomainError("conflict", "Someone else saved this page since you opened it. Reload to see their changes.")
        const published = input.published !== false
        if (published !== Boolean(row?.published)) requireGrant(actor, "content:publish")
        const updatedAt = new Date(Math.max(Date.now(), row ? Date.parse(isoDate(row.updatedAt)) + 1 : 0)).toISOString()
        const values = { ...input, published: published ? 1 : 0, updatedAt: sqlDate(updatedAt) }
        if (row) await db.update(pages).set(values).where(previousWhere)
        else await db.insert(pages).values({ ...values, storeId })
        return { ...structuredClone(input), published, updatedAt }
      })
    },
    async deletePage(actor, storeId, slug) {
      requireStore(actor, storeId); requireGrant(actor, "content:write")
      const db = await database()
      const [result] = await db.delete(pages).where(and(eq(pages.storeId, actor.storeId), eq(pages.slug, slug)))
      if (!result.affectedRows) throw new DomainError("not_found", "Page not found.")
    },
    async saveFaq(actor, storeId, faq) {
      requireStore(actor, storeId); requireGrant(actor, "content:write")
      return withTransaction(async (db) => {
        const where = and(eq(faqs.storeId, actor.storeId), eq(faqs.id, faq.id))
        const [row] = await db.select({ id: faqs.id }).from(faqs).where(where).for("update")
        if (row) await db.update(faqs).set(faq).where(where)
        else await db.insert(faqs).values({ ...faq, storeId })
        return structuredClone(faq)
      })
    },
    async deleteFaq(actor, storeId, id) {
      requireStore(actor, storeId); requireGrant(actor, "content:write")
      const db = await database()
      const [result] = await db.delete(faqs).where(and(eq(faqs.storeId, actor.storeId), eq(faqs.id, id)))
      if (!result.affectedRows) throw new DomainError("not_found", "Question not found.")
    },
    async reorderFaqs(actor, storeId, ids) {
      requireStore(actor, storeId); requireGrant(actor, "content:write")
      await withTransaction(async (db) => {
        await db.select({ id: stores.id }).from(stores).where(eq(stores.id, actor.storeId)).for("update")
        for (const [position, id] of ids.entries()) await db.update(faqs).set({ position }).where(and(eq(faqs.storeId, actor.storeId), eq(faqs.id, id)))
      })
    },
    async listSubscribers(actor, storeId, query) {
      requireStore(actor, storeId); requireGrant(actor, "marketing:read")
      const db = await database()
      const where = and(eq(newsletterSubscribers.storeId, actor.storeId), query.status ? eq(newsletterSubscribers.status, query.status) : undefined)
      const [rows, [total]] = await Promise.all([
        db.select({ email: newsletterSubscribers.email, status: newsletterSubscribers.status, source: newsletterSubscribers.source, consentAt: newsletterSubscribers.consentAt }).from(newsletterSubscribers).where(where).orderBy(desc(newsletterSubscribers.consentAt)).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
        db.select({ count: count() }).from(newsletterSubscribers).where(where),
      ])
      return { subscribers: rows.map((row): NewsletterSubscriber => ({ ...row, status: row.status as NewsletterSubscriber["status"], consentAt: isoDate(row.consentAt) })), total: total.count }
    },
  }
}
