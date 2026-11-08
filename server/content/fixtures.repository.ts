import "server-only"
import { fixturePolicy } from "@/server/db/fixtures-policy.repository"
import { contentGuards } from "@/server/db/fixture-guards.repository"

import type { ContentOperations, ContentRepository } from "@/server/content/repository"
import { db, transaction } from "@/server/fixtures/store"
import { DomainError } from "@/server/shared/errors"
import { now } from "@/server/shared/ids"

export function createFixturesContentRepository(): ContentRepository {
  const operations: ContentOperations = {
    async home() { return structuredClone(db().home) },
    async saveHome(_storeId, content, expectedUpdatedAt) {
      return transaction((tables) => {
        if ((tables.home?.updatedAt ?? null) !== expectedUpdatedAt) throw new DomainError("conflict", "Someone else saved the homepage. Reload before saving.")
        tables.home = { content: structuredClone(content), updatedAt: new Date(Math.max(Date.now(), Date.parse(tables.home?.updatedAt ?? "1970-01-01") + 1)).toISOString() }
        return structuredClone(tables.home)
      })
    },
    async listPages() {
      return structuredClone(db().pages.filter((page) => page.published !== false))
    },
    async getPage(_storeId, slug) {
      return structuredClone(db().pages.find((page) => page.slug === slug && page.published !== false) ?? null)
    },
    async listFaqs() {
      return structuredClone([...db().faqs].sort((a, b) => a.position - b.position))
    },
    async subscribe(_storeId, subscriber) {
      return transaction((tables) => {
        const existing = tables.newsletter.find((row) => row.email === subscriber.email)
        if (existing?.status === "subscribed") return false
        if (existing) Object.assign(existing, subscriber)
        else tables.newsletter.push(subscriber)
        return true
      })
    },
    async unsubscribe(_storeId, email) {
      const row = db().newsletter.find((item) => item.email === email)
      if (row) row.status = "unsubscribed"
    },
    async saveContactMessage(_storeId, message) {
      db().contactMessages.push(message)
    },

    async staffPages() {
      return structuredClone(db().pages.map((page) => ({ ...page, published: page.published !== false })))
    },
    async staffPage(_storeId, slug) {
      const page = db().pages.find((row) => row.slug === slug)
      return page ? structuredClone({ ...page, published: page.published !== false }) : null
    },
    async savePage(_storeId, page, previousSlug, expectedUpdatedAt) {
      return transaction((tables) => {
        const index = previousSlug ? tables.pages.findIndex((row) => row.slug === previousSlug) : -1
        if (previousSlug && index === -1) throw new DomainError("not_found", "Page not found.")
        if (index !== -1 && expectedUpdatedAt && tables.pages[index].updatedAt !== expectedUpdatedAt) throw new DomainError("conflict", "Someone else saved this page since you opened it. Reload to see their changes.")
        if (tables.pages.some((row, at) => row.slug === page.slug && at !== index)) throw new DomainError("conflict", "Another page already uses this web address.")
        const saved = { ...structuredClone(page), updatedAt: now() }
        if (index === -1) tables.pages.push(saved)
        else tables.pages[index] = saved
        return structuredClone(saved)
      })
    },
    async deletePage(_storeId, slug) {
      transaction((tables) => {
        if (!tables.pages.some((row) => row.slug === slug)) throw new DomainError("not_found", "Page not found.")
        tables.pages = tables.pages.filter((row) => row.slug !== slug)
      })
    },
    async saveFaq(_storeId, faq) {
      return transaction((tables) => {
        const index = tables.faqs.findIndex((row) => row.id === faq.id)
        if (index === -1) tables.faqs.push(structuredClone(faq))
        else tables.faqs[index] = structuredClone(faq)
        return structuredClone(faq)
      })
    },
    async deleteFaq(_storeId, id) {
      transaction((tables) => {
        if (!tables.faqs.some((row) => row.id === id)) throw new DomainError("not_found", "Question not found.")
        tables.faqs = tables.faqs.filter((row) => row.id !== id)
      })
    },
    async reorderFaqs(_storeId, ids) {
      transaction((tables) => {
        ids.forEach((id, position) => {
          const faq = tables.faqs.find((row) => row.id === id)
          if (faq) faq.position = position
        })
      })
    },
    async listSubscribers(_storeId, query) {
      const found = db()
        .newsletter.filter((row) => !query.status || row.status === query.status)
        .sort((a, b) => b.consentAt.localeCompare(a.consentAt))
      const start = (query.page - 1) * query.pageSize
      return { subscribers: structuredClone(found.slice(start, start + query.pageSize)), total: found.length }
    },
  }
  return fixturePolicy<ContentOperations>(operations, contentGuards)
}
