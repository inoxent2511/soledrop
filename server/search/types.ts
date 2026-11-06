/** Where a search was made: the header overlay (as-you-type) or the /search results page. */
export type SearchSource = "overlay" | "page"

/** One logged search, or one click on a result (then `clickedSlug` is set and `resultCount` is null). */
export type SearchEvent = {
  id: string
  query: string
  /** fold(query): what trending and zero-result reports group by. */
  normalized: string
  resultCount: number | null
  clickedSlug: string | null
  source: SearchSource
  createdAt: string
}

/** A merchant-managed synonym group: searching any of the words finds the others. */
export type SynonymGroup = { id: string; term: string; synonyms: string[] }

export type TrendingQuery = { query: string; count: number }

/** Search analytics for the admin (A8). */
export type SearchReport = {
  searches: number
  zeroResultSearches: number
  clicks: number
  top: { query: string; count: number; clicks: number }[]
  zero: { query: string; count: number }[]
}
