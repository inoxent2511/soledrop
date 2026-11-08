import "server-only"
import { mysqlPolicy } from "@/server/db/policy.repository"

import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull } from "drizzle-orm"
import type { SearchOperations } from "./repository"
import { type ActorScoped, requireGrant, requireStore } from "@/server/db/actor"
import { database, withTransaction } from "@/server/db/client"
import { searchQueries, searchSynonyms, searchSynonymValues, stores } from "@/server/db/schema"
import { sqlDate } from "@/server/db/values"
import { DomainError } from "@/server/shared/errors"
import { assertSearchEvent, searchWindow } from "./validation"
import { similarHistoryQueries } from "./history"

export function createMysqlSearchRepository(): ActorScoped<SearchOperations> {
  const repository: ActorScoped<SearchOperations> = mysqlPolicy<SearchOperations>({
    async similarQueries(actor, storeId, query, days, limit) {
      requireStore(actor, storeId); requireGrant(actor, "search:read")
      return similarHistoryQueries(await repository.report(actor, storeId, days, 1000), query, limit)
    },
    async listSynonyms(actor, storeId) {
      requireStore(actor, storeId)
      const db = await database()
      const rows = await db.select().from(searchSynonyms).where(eq(searchSynonyms.storeId, actor.storeId)).orderBy(searchSynonyms.term)
      if (!rows.length) return []
      const values = await db.select().from(searchSynonymValues).where(inArray(searchSynonymValues.id, rows.map((row) => row.id))).orderBy(searchSynonymValues.position)
      return rows.map((row) => ({ id: row.id, term: row.term, synonyms: values.filter((value) => value.id === row.id).map((value) => value.value) }))
    },
    async logEvent(actor, storeId, event) {
      requireStore(actor, storeId)
      assertSearchEvent(event)
      const db = await database()
      await db.insert(searchQueries).values({ ...event, storeId, createdAt: sqlDate(event.createdAt) })
    },
    async trending(actor, storeId, days, limit) {
      requireStore(actor, storeId)
      const bounded = searchWindow(days, limit); days = bounded.days; limit = bounded.limit
      const db = await database()
      return db.select({ query: searchQueries.normalized, count: count() }).from(searchQueries).where(and(eq(searchQueries.storeId, actor.storeId), gte(searchQueries.createdAt, sqlDate(new Date(Date.now() - days * 86_400_000).toISOString())), isNull(searchQueries.clickedSlug), gt(searchQueries.resultCount, 0))).groupBy(searchQueries.normalized).orderBy(desc(count()), asc(searchQueries.normalized)).limit(Math.min(1000, limit))
    },
    async report(actor, storeId, days, limit) {
      requireStore(actor, storeId); requireGrant(actor, "search:read")
      const bounded = searchWindow(days, limit, 1000); days = bounded.days; limit = bounded.limit
      const db = await database()
      const scope = and(eq(searchQueries.storeId, actor.storeId), gte(searchQueries.createdAt, sqlDate(new Date(Date.now() - days * 86_400_000).toISOString())))
      const totals = await Promise.all([
        db.select({ count: count() }).from(searchQueries).where(and(scope, isNull(searchQueries.clickedSlug))),
        db.select({ count: count() }).from(searchQueries).where(and(scope, eq(searchQueries.resultCount, 0))),
        db.select({ count: count() }).from(searchQueries).where(and(scope, isNotNull(searchQueries.clickedSlug))),
      ])
      const grouped = (successful: boolean) => db.select({ query: searchQueries.normalized, count: count() }).from(searchQueries).where(and(scope, isNull(searchQueries.clickedSlug), successful ? gt(searchQueries.resultCount, 0) : eq(searchQueries.resultCount, 0))).groupBy(searchQueries.normalized).orderBy(desc(count()), asc(searchQueries.normalized)).limit(Math.min(1000, limit))
      const [top, zero] = await Promise.all([grouped(true), grouped(false)])
      const clicks = top.length ? await db.select({ query: searchQueries.normalized, count: count() }).from(searchQueries).where(and(scope, isNotNull(searchQueries.clickedSlug), inArray(searchQueries.normalized, top.map((row) => row.query)))).groupBy(searchQueries.normalized) : []
      return { searches: totals[0][0].count, zeroResultSearches: totals[1][0].count, clicks: totals[2][0].count, top: top.map((row) => ({ ...row, clicks: clicks.find((entry) => entry.query === row.query)?.count ?? 0 })), zero }
    },
    async saveSynonym(actor, storeId, group) {
      requireStore(actor, storeId); requireGrant(actor, "search:write")
      if (!group.synonyms.length) throw new DomainError("validation", "Add at least one synonym.")
      return withTransaction(async (db) => {
        await db.select({ id: stores.id }).from(stores).where(eq(stores.id, actor.storeId)).for("update")
        const where = and(eq(searchSynonyms.storeId, actor.storeId), eq(searchSynonyms.id, group.id))
        const [row] = await db.select({ id: searchSynonyms.id }).from(searchSynonyms).where(where).for("update")
        if (row) await db.update(searchSynonyms).set({ term: group.term }).where(where)
        else await db.insert(searchSynonyms).values({ id: group.id, storeId, term: group.term })
        await db.delete(searchSynonymValues).where(eq(searchSynonymValues.id, group.id))
        await db.insert(searchSynonymValues).values(group.synonyms.map((value, position) => ({ id: group.id, value, position })))
        return structuredClone(group)
      })
    },
    async deleteSynonym(actor, storeId, id) {
      requireStore(actor, storeId); requireGrant(actor, "search:write")
      const db = await database()
      const [result] = await db.delete(searchSynonyms).where(and(eq(searchSynonyms.storeId, actor.storeId), eq(searchSynonyms.id, id)))
      if (!result.affectedRows) throw new DomainError("not_found", "Synonym not found.")
    },
  })
  return repository
}
