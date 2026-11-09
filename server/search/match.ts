/**
 * Query matching shared by both data drivers: diacritics- and case-insensitive, synonym-aware,
 * typo-tolerant (one edit for words of 4–7 letters, two from 8) and aware of SKUs and EU sizes.
 * Pure functions, so the fixtures and MySQL/MariaDB drivers rank results identically.
 */

/** Term → equivalent terms, both folded ("sneakers" → ["trainers", "shoes"]). */
export type SynonymMap = Map<string, string[]>

/** Lower-case, strip accents and punctuation: "Pré-Loved" → "pre loved". */
export function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function terms(text: string): string[] {
  return fold(text).split(" ").filter(Boolean)
}

/** Optimal-string-alignment distance (Damerau–Levenshtein with adjacent swaps), capped at `max + 1`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const cap = max + 1, width = Math.ceil(max)
  let twoBack = Array<number>(b.length + 1).fill(cap)
  let previous = Array.from({ length: b.length + 1 }, (_, j) => Math.min(j, cap))
  let current = Array<number>(b.length + 1).fill(cap)
  for (let i = 1; i <= a.length; i++) {
    current.fill(cap)
    current[0] = Math.min(i, cap)
    let minimum = current[0]
    // A path within the cap stays in this diagonal band. Three rows retain adjacent swaps.
    for (let j = Math.max(1, i - width); j <= Math.min(b.length, i + width); j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, twoBack[j - 2] + 1)
      current[j] = Math.min(value, cap)
      minimum = Math.min(minimum, current[j])
    }
    if (minimum >= cap) return cap
    const reusable = twoBack
    twoBack = previous; previous = current; current = reusable
  }
  return Math.min(previous[b.length], cap)
}

/** Edits a typed word may contain and still match: none below 4 letters, so "nb" never matches "nike". */
export function allowedEdits(term: string): number {
  if (term.length >= 8) return 2
  if (term.length >= 4) return 1
  return 0
}

/** True when `term` matches `word` exactly, as a prefix (3+ letters) or within the typo allowance. */
export function wordMatches(term: string, word: string): "exact" | "prefix" | "fuzzy" | null {
  if (word === term) return "exact"
  if (term.length >= 3 && word.startsWith(term)) return "prefix"
  const edits = allowedEdits(term)
  if (edits > 0 && editDistance(term, word, edits) <= edits) return "fuzzy"
  return null
}

/** The term plus its synonyms; multi-word synonyms ("new balance") stay as phrases. */
export function expand(term: string, synonyms: SynonymMap): string[] {
  return [term, ...(synonyms.get(term) ?? [])]
}

export type Searchable = {
  /** Brand + title: the strongest field. */
  title: string
  /** Colour, description, tags. */
  body: string
  skus: string[]
  sizes: string[]
}

const WEIGHT = { exact: 3, prefix: 2.5, fuzzy: 1.5 } as const

function fieldScore(alternatives: string[], text: string, words: string[]): number {
  let best = 0
  for (const alternative of alternatives) {
    if (alternative.includes(" ")) {
      if (` ${text} `.includes(` ${alternative} `)) best = Math.max(best, WEIGHT.exact)
      continue
    }
    for (const word of words) {
      const kind = wordMatches(alternative, word)
      if (kind) best = Math.max(best, WEIGHT[kind])
    }
  }
  return best
}

/**
 * Relevance of a product for a query, 0 when it does not match. Every term must match some field
 * (title outranks body); a whole-query SKU match or an EU size number counts as a match too.
 */
export function score(item: Searchable, query: string, synonyms: SynonymMap = new Map()): number {
  const queryTerms = terms(query)
  if (queryTerms.length === 0) return 1
  const compactQuery = fold(query).replace(/\s/g, "")
  if (item.skus.some((sku) => fold(sku).replace(/\s/g, "") === compactQuery)) return 10
  const title = fold(item.title)
  const body = fold(item.body)
  const titleWords = title.split(" ")
  const bodyWords = body.split(" ")
  let total = 0
  for (const term of queryTerms) {
    const alternatives = expand(term, synonyms)
    const inTitle = fieldScore(alternatives, title, titleWords)
    const inBody = inTitle > 0 ? 0 : fieldScore(alternatives, body, bodyWords) / 3
    const isSize = /^\d{2}(\.\d)?$/.test(term) && item.sizes.includes(term)
    const value = Math.max(inTitle, inBody, isSize ? 1 : 0)
    if (value === 0) return 0
    total += value
  }
  return total
}

/**
 * "Did you mean": each typed word replaced by the closest vocabulary word within two edits,
 * or null when nothing changes (the query was spelled like the catalogue, or nothing is close).
 */
export function suggestSpelling(query: string, vocabulary: Iterable<string>): string | null {
  const words = [...new Set(vocabulary)].filter((word) => word.length >= 3)
  let changed = false
  const corrected = terms(query).map((term) => {
    if (words.includes(term)) return term
    let best: { word: string; distance: number } | null = null
    for (const word of words) {
      const distance = editDistance(term, word, 2)
      if (distance <= 2 && (!best || distance < best.distance)) best = { word, distance }
    }
    if (!best) return term
    changed = true
    return best.word
  })
  return changed ? corrected.join(" ") : null
}
