import "server-only"
import { and, eq, Param, sql } from "drizzle-orm"
import type { Database } from "@/server/db/client"
import { orderSearchGrams as grams, orderSearchLinks as links, orderSearchValues as values } from "@/server/db/schema"
import { substringGram } from "./search-values"

/** A gram narrows values; exact binary verification retains literal JS includes semantics. */
export function orderSubstringCandidates(db: Database, storeId: string, term: string) {
  const matching = (text: string, kind: number) => {
    const contains = sql.fromList([sql.raw("LOCATE("), new Param(text), sql.raw(",CAST("), values.normalizedText, sql.raw(" AS BINARY))>0")])
    return db.select({ hash: sql.fromList([sql.raw("STRAIGHT_JOIN "), grams.valueHash]).as("value_hash") }).from(grams).innerJoin(values, and(eq(values.storeId, grams.storeId), eq(values.valueHash, grams.valueHash))).where(and(eq(grams.storeId, storeId), eq(grams.gram, substringGram(text)), eq(values.kind, kind), contains))
  }
  const digits = term.replace(/\D/g, ""), branches = [matching(term, 0).getSQL(), ...(digits.length >= 4 ? [matching(digits, 1).getSQL()] : [])]
  const matches = sql.fromList([sql.raw("("), sql.join(branches, sql.raw(" UNION ALL ")), sql.raw(") order_search_matching_values")])
  const ids = db.selectDistinct({ id: sql.fromList([sql.raw("STRAIGHT_JOIN "), links.orderId]).as("id") }).from(matches).innerJoin(links, and(eq(links.storeId, storeId), eq(links.valueHash, sql.raw("order_search_matching_values.value_hash"))))
  return sql.fromList([sql.raw("("), ids.getSQL(), sql.raw(") order_search_candidates")])
}
