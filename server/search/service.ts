import "server-only"

import { fold, type SynonymMap } from "@/server/search/match"
import type { SearchOperations } from "@/server/search/repository"
import type { SearchSource, TrendingQuery } from "@/server/search/types"
import { newId } from "@/server/shared/ids"

const TRENDING_DAYS = 30
const MAX_LOGGED_QUERY = 100

type Deps = { search: SearchOperations; now?: () => Date }

export function createSearchService({ search, now = () => new Date() }: Deps) {
  async function log(storeId: string, query: string, source: SearchSource, resultCount: number | null, clickedSlug: string | null) {
    const trimmed = query.trim().slice(0, MAX_LOGGED_QUERY)
    const normalized = fold(trimmed)
    if (!normalized) return
    await search.logEvent(storeId, { id: newId(), query: trimmed, normalized, resultCount, clickedSlug, source, createdAt: now().toISOString() })
  }

  return {
    /** Every word of a group maps to the rest of its group, folded, so matching is symmetric. */
    async synonymMap(storeId: string): Promise<SynonymMap> {
      const map: SynonymMap = new Map()
      for (const group of await search.listSynonyms(storeId)) {
        const words = [...new Set([group.term, ...group.synonyms].map(fold).filter(Boolean))]
        for (const word of words) map.set(word, [...new Set([...(map.get(word) ?? []), ...words.filter((other) => other !== word)])])
      }
      return map
    },

    /** Logs a completed search; zero-result searches are kept so merchandisers can see the gaps. */
    logSearch: (storeId: string, query: string, resultCount: number, source: SearchSource) => log(storeId, query, source, resultCount, null),

    logClick: (storeId: string, query: string, slug: string, source: SearchSource) => log(storeId, query, source, null, slug),

    /** Shoppers' most frequent successful searches, topped up from the curated list when the log is thin. */
    async trending(storeId: string, curated: string[], limit = 6): Promise<TrendingQuery[]> {
      const logged = await search.trending(storeId, TRENDING_DAYS, limit)
      const seen = new Set(logged.map((entry) => entry.query))
      const extra = curated.filter((query) => !seen.has(fold(query))).map((query) => ({ query: fold(query), count: 0 }))
      return [...logged, ...extra].slice(0, limit)
    },
  }
}

export type SearchService = ReturnType<typeof createSearchService>
