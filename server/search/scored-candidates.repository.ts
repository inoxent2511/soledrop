import "server-only"
import { and, eq, gt, gte, inArray, like, lte, max, or, Param, SQL, sql } from "drizzle-orm"
import type { Database } from "@/server/db/client"
import { productListingSizes, searchDocuments, searchFieldTerms, searchFieldVocabulary, searchSkus } from "@/server/db/schema"
import { escapeLike } from "@/server/db/values"
import { allowedEdits, expand, fold, terms, wordMatches, type SynonymMap } from "./match"

const value = (input: unknown) => new SQL([new Param(input)])
const choose = (condition: SQL | undefined, yes: SQL | number, no: SQL | number) => sql.fromList([sql.raw("CASE WHEN "), condition ?? value(false), sql.raw(" THEN "), typeof yes === "number" ? value(yes) : yes, sql.raw(" ELSE "), typeof no === "number" ? value(no) : no, sql.raw(" END")])
const literalPrefix = (column: typeof searchFieldTerms.term | typeof searchFieldVocabulary.term, term: string) => /[\u{10000}-\u{10ffff}]/u.test(term)
  ? sql.fromList([sql.raw("BINARY "), column, sql.raw(" LIKE BINARY "), value(escapeLike(term) + "%")])
  : like(column, escapeLike(term) + "%")
const prefix = (term: string) => literalPrefix(searchFieldTerms.term, term)
type ScoredCandidates = { source: SQL; constantRelevance: boolean }

/** Aggregate indexed matching terms once instead of probing fields for every product. */
export async function scoredCatalogueCandidates(db: Database, storeId: string, query: string, synonyms: SynonymMap): Promise<ScoredCandidates | undefined> {
  const queryTerms = terms(query)
  if (!queryTerms.length) return undefined
  const skuCondition = and(eq(searchSkus.storeId, storeId), eq(searchSkus.compact, fold(query).replace(/\s/g, "")))
  const hasSku = queryTerms.length === 1 && (await db.select({ id: searchSkus.productId }).from(searchSkus).where(skuCondition).limit(1)).length > 0
  const alternatives = [...new Set(queryTerms.flatMap((term) => expand(term, synonyms)).filter((term) => !term.includes(" ")))]
  const dictionary = alternatives.length ? await db.select({ term: searchFieldVocabulary.term, field: searchFieldVocabulary.field }).from(searchFieldVocabulary).where(and(eq(searchFieldVocabulary.storeId, storeId), gt(searchFieldVocabulary.documentFrequency, 0), or(...alternatives.flatMap((term) => [eq(searchFieldVocabulary.term, term), term.length >= 3 ? literalPrefix(searchFieldVocabulary.term, term) : undefined, allowedEdits(term) > 0 ? and(gte(searchFieldVocabulary.length, term.length - allowedEdits(term)), lte(searchFieldVocabulary.length, term.length + allowedEdits(term))) : undefined])))) : []
  const fuzzy = new Map(alternatives.map((term) => [term, [...new Set(dictionary.map((row) => row.term).filter((word) => wordMatches(term, word) === "fuzzy"))]]))
  let constantRelevance = false
  const perTerm = await Promise.all(queryTerms.map(async (term) => {
    const choices = expand(term, synonyms), words = choices.filter((choice) => !choice.includes(" "))
    const exact = words.length ? inArray(searchFieldTerms.term, words) : value(false)
    const prefixes = words.filter((word) => word.length >= 3).map(prefix)
    const edits = [...new Set(words.flatMap((word) => fuzzy.get(word) ?? []))]
    const match = or(exact, ...prefixes, edits.length ? inArray(searchFieldTerms.term, edits) : undefined)
    const wordScore = choose(exact, 3, choose(or(...prefixes), 2.5, 1.5))
    const weighted = choose(eq(searchFieldTerms.field, "title"), wordScore, sql.fromList([sql.raw("("), wordScore, sql.raw(") / 3")]))
    if (queryTerms.length === 1 && !hasSku && !choices.some((choice) => choice.includes(" ")) && !/^\d{2}(\.\d)?$/.test(term)) {
      const matches = dictionary.filter((row) => words.some((word) => wordMatches(word, row.term)))
      if (matches.length <= 1) {
        constantRelevance = true
        // One indexed field/word has at most one row per product. It needs no
        // grouping/materialized ID set, even when it matches the whole store.
        return db.select({ id: sql.fromList([searchFieldTerms.productId]).as("id"), points: weighted.as("points") }).from(searchFieldTerms, { forceIndex: "search_field_store_lookup" }).where(and(eq(searchFieldTerms.storeId, storeId), matches.length ? and(eq(searchFieldTerms.term, matches[0].term), eq(searchFieldTerms.field, matches[0].field)) : value(false))).getSQL()
      }
    }
    const branches = [db.select({ id: sql.fromList([searchFieldTerms.productId]).as("id"), points: max(weighted).as("points") }).from(searchFieldTerms, { forceIndex: "search_field_store_lookup" }).where(and(eq(searchFieldTerms.storeId, storeId), match)).groupBy(searchFieldTerms.productId).getSQL()]
    const phrases = choices.filter((choice) => choice.includes(" "))
    for (const phrase of phrases) {
      const contains = (column: typeof searchDocuments.title | typeof searchDocuments.body) => like(sql.fromList([sql.raw("CONCAT(' ', "), column, sql.raw(", ' ')")]), "% " + escapeLike(phrase) + " %")
      const title = and(eq(searchFieldTerms.field, "title"), contains(searchDocuments.title)), body = and(eq(searchFieldTerms.field, "body"), contains(searchDocuments.body))
      branches.push(db.select({ id: searchFieldTerms.productId, points: choose(eq(searchFieldTerms.field, "title"), 3, 1) }).from(searchFieldTerms, { forceIndex: "search_field_store_lookup" }).innerJoin(searchDocuments, eq(searchDocuments.productId, searchFieldTerms.productId)).where(and(eq(searchFieldTerms.storeId, storeId), eq(searchDocuments.storeId, storeId), eq(searchFieldTerms.term, [...terms(phrase)[0]].slice(0, 300).join("")), or(title, body))).getSQL())
    }
    if (/^\d{2}(\.\d)?$/.test(term)) branches.push(db.select({ id: productListingSizes.productId, points: value(1) }).from(productListingSizes).where(and(eq(productListingSizes.storeId, storeId), eq(productListingSizes.size, term))).getSQL())
    return branches.length === 1 ? branches[0] : sql.fromList([sql.raw("SELECT id, MAX(points) AS points FROM ("), sql.join(branches, sql.raw(" UNION ALL ")), sql.raw(") catalogue_term_hits GROUP BY id")])
  }))
  if (queryTerms.length === 1 && !hasSku) return { source: sql.fromList([sql.raw("(SELECT id, points AS relevance FROM ("), perTerm[0], sql.raw(") catalogue_single_term) AS catalogue_search_candidates")]), constantRelevance }
  const matched = sql.fromList([sql.raw("SELECT id, SUM(points) AS points, 0 AS sku FROM ("), sql.join(perTerm, sql.raw(" UNION ALL ")), sql.raw(") catalogue_term_scores GROUP BY id HAVING COUNT(*) = "), value(queryTerms.length)])
  const sku = db.select({ id: searchSkus.productId, points: value(10), sku: value(1) }).from(searchSkus).where(skuCondition).getSQL()
  return { source: sql.fromList([sql.raw("(SELECT id, CASE WHEN MAX(sku)>0 THEN 10 ELSE MAX(points) END AS relevance FROM ("), matched, sql.raw(" UNION ALL "), sku, sql.raw(") catalogue_all_scores GROUP BY id) AS catalogue_search_candidates")]), constantRelevance: false }
}
