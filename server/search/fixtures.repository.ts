import "server-only"

import { db, transaction } from "@/server/fixtures/store"
import { DomainError } from "@/server/shared/errors"
import type { SearchOperations } from "@/server/search/repository"

export function createFixturesSearchRepository(): SearchOperations {
  return {
    async listSynonyms() {
      return structuredClone(db().searchSynonyms)
    },
    async logEvent(_storeId, event) {
      db().searchEvents.push(structuredClone(event))
    },
    async trending(_storeId, days, limit) {
      const since = Date.now() - days * 86_400_000
      const counts = new Map<string, number>()
      for (const event of db().searchEvents) {
        if (event.clickedSlug !== null || !event.resultCount || Date.parse(event.createdAt) < since) continue
        counts.set(event.normalized, (counts.get(event.normalized) ?? 0) + 1)
      }
      return [...counts]
        .map(([query, count]) => ({ query, count }))
        .sort((a, b) => b.count - a.count || a.query.localeCompare(b.query))
        .slice(0, limit)
    },
    async report(_storeId, days, limit) {
      const since = Date.now() - days * 86_400_000
      const events = db().searchEvents.filter((event) => Date.parse(event.createdAt) >= since)
      const searches = events.filter((event) => event.clickedSlug === null)
      const clicks = events.filter((event) => event.clickedSlug !== null)
      const tally = (rows: typeof events) => {
        const counts = new Map<string, number>()
        for (const row of rows) counts.set(row.normalized, (counts.get(row.normalized) ?? 0) + 1)
        return counts
      }
      const clickCounts = tally(clicks)
      const top = [...tally(searches.filter((event) => (event.resultCount ?? 0) > 0))].map(([query, count]) => ({ query, count, clicks: clickCounts.get(query) ?? 0 }))
      const zero = [...tally(searches.filter((event) => event.resultCount === 0))].map(([query, count]) => ({ query, count }))
      const order = (a: { query: string; count: number }, b: { query: string; count: number }) => b.count - a.count || a.query.localeCompare(b.query)
      return { searches: searches.length, zeroResultSearches: searches.filter((event) => event.resultCount === 0).length, clicks: clicks.length, top: top.sort(order).slice(0, limit), zero: zero.sort(order).slice(0, limit) }
    },
    async saveSynonym(_storeId, group) {
      return transaction((tables) => {
        if (tables.searchSynonyms.some((row) => row.id !== group.id && row.term === group.term)) throw new DomainError("conflict", "That word already has synonyms. Edit it instead.")
        const index = tables.searchSynonyms.findIndex((row) => row.id === group.id)
        if (index === -1) tables.searchSynonyms.push(structuredClone(group))
        else tables.searchSynonyms[index] = structuredClone(group)
        return structuredClone(group)
      })
    },
    async deleteSynonym(_storeId, id) {
      transaction((tables) => {
        if (!tables.searchSynonyms.some((row) => row.id === id)) throw new DomainError("not_found", "Synonym not found.")
        tables.searchSynonyms = tables.searchSynonyms.filter((row) => row.id !== id)
      })
    },
  }
}
