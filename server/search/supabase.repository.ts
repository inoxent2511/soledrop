import "server-only"

import { supabase, unwrap } from "@/server/db/supabase"
import type { SearchOperations } from "@/server/search/repository"
import type { SynonymGroup, TrendingQuery } from "@/server/search/types"
import { DomainError } from "@/server/shared/errors"

export function createSupabaseSearchRepository(): SearchOperations {
  return {
    async listSynonyms(storeId) {
      return unwrap(await supabase().from("search_synonyms").select("id, term, synonyms").eq("store_id", storeId).order("term")) as SynonymGroup[]
    },
    async logEvent(storeId, event) {
      unwrap(
        await supabase().from("search_queries").insert({
          id: event.id,
          store_id: storeId,
          query: event.query,
          normalized: event.normalized,
          result_count: event.resultCount,
          clicked_slug: event.clickedSlug,
          source: event.source,
          created_at: event.createdAt,
        }),
      )
    },
    async trending(storeId, days, limit) {
      const rows = unwrap(await supabase().rpc("search_trending", { p_store_id: storeId, p_days: days, p_limit: limit })) as { query: string; count: number }[]
      return rows.map((row): TrendingQuery => ({ query: row.query, count: Number(row.count) }))
    },
    async report(storeId, days, limit) {
      const row = unwrap(await supabase().rpc("search_report", { p_store_id: storeId, p_days: days, p_limit: limit })) as {
        searches: number
        zero_result_searches: number
        clicks: number
        top: { query: string; count: number; clicks: number }[] | null
        zero: { query: string; count: number }[] | null
      }
      return { searches: Number(row.searches), zeroResultSearches: Number(row.zero_result_searches), clicks: Number(row.clicks), top: row.top ?? [], zero: row.zero ?? [] }
    },
    async saveSynonym(storeId, group) {
      unwrap(await supabase().from("search_synonyms").upsert({ id: group.id, store_id: storeId, term: group.term, synonyms: group.synonyms }, { onConflict: "id" }))
      return group
    },
    async deleteSynonym(storeId, id) {
      const rows = unwrap(await supabase().from("search_synonyms").delete().eq("store_id", storeId).eq("id", id).select("id")) as { id: string }[]
      if (!rows.length) throw new DomainError("not_found", "Synonym not found.")
    },
  }
}
