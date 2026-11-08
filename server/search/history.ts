import { fold, wordMatches } from "./match"
import type { SearchReport } from "./types"
import { searchWindow } from "./validation"

export function similarHistoryQueries(report: SearchReport, query: string, limit: number): string[] {
  const term = fold(query), bounded = searchWindow(30, limit, 50).limit
  if (!term) return []
  return [...new Set([...report.top, ...report.zero].map((row) => row.query))].filter((candidate) => Boolean(wordMatches(term, candidate))).sort().slice(0, bounded)
}
