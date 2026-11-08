import type { ActorScoped } from "@/server/db/actor"
import type { SearchEvent, SearchReport, SynonymGroup, TrendingQuery } from "@/server/search/types"

export interface SearchOperations {
  listSynonyms(storeId: string): Promise<SynonymGroup[]>
  /** Appends a search or click event; never read back by shoppers. */
  logEvent(storeId: string, event: SearchEvent): Promise<void>
  /** Most frequent searches that found something within the last `days`, most searched first. */
  trending(storeId: string, days: number, limit: number): Promise<TrendingQuery[]>

  // ─── Staff (admin A8) ─────────────────────────────────────────────────────
  /** What shoppers searched in the last `days`: totals, top queries with clicks, and searches that found nothing. */
  report(storeId: string, days: number, limit: number): Promise<SearchReport>
  /** Bounded fuzzy merchant-history lookup, replacing the private engine-specific operator. */
  similarQueries(storeId: string, query: string, days: number, limit: number): Promise<string[]>
  /** Creates or updates a synonym group; a term is unique per store. */
  saveSynonym(storeId: string, group: SynonymGroup): Promise<SynonymGroup>
  deleteSynonym(storeId: string, id: string): Promise<void>
}

/** Raw storage boundary; services receive explicitly bound operations. */
export type SearchRepository = ActorScoped<SearchOperations>
