import "server-only"

import { and, eq, inArray, sql } from "drizzle-orm"
import type { Product } from "@/server/catalog/types"
import type { Database } from "@/server/db/client"
import { searchDocuments, searchDocumentTerms, searchFieldTerms, searchFieldVocabulary, searchSkus, searchTerms } from "@/server/db/schema"
import { sqlDate } from "@/server/db/values"
import { searchable } from "./document"
import { fold, terms } from "./match"

const bounded = (text: string, units: number) => {
  let result = ""
  for (const character of text) { if (result.length + character.length > units) break; result += character }
  return result
}

/** Caller holds the store/product write lock. This projection never changes merchant records. */
export async function syncCatalogueSearch(db: Database, product: Product) {
  const document = searchable(product), title = fold(document.title), body = fold(document.body)
  const previous = await db.select({ term: searchDocumentTerms.term }).from(searchDocumentTerms).where(eq(searchDocumentTerms.productId, product.id)).for("update")
  const previousFields = await db.select({ term: searchFieldTerms.term, field: searchFieldTerms.field }).from(searchFieldTerms).where(eq(searchFieldTerms.productId, product.id)).for("update")
  const words = [...new Set(terms(title + " " + body).map((word) => bounded(word, 100)))]
  const old = new Set(previous.map((row) => row.term)), current = new Set(words)
  const values = { storeId: product.storeId, slug: product.slug, title, body, prefix: bounded(title, 190), updatedAt: sqlDate(new Date().toISOString()) }
  await db.insert(searchDocuments).values({ productId: product.id, ...values }).onDuplicateKeyUpdate({ set: values })
  await db.delete(searchFieldTerms).where(eq(searchFieldTerms.productId, product.id))
  await db.delete(searchDocumentTerms).where(eq(searchDocumentTerms.productId, product.id))
  await db.delete(searchSkus).where(eq(searchSkus.productId, product.id))
  const fields = (["title", "body"] as const).flatMap((field) => {
    const positions = new Map<string, number>()
    terms(field === "title" ? title : body).forEach((word, position) => { word = [...word].slice(0, 300).join(""); if (!positions.has(word)) positions.set(word, position) })
    return [...positions].map(([term, position]) => ({ productId: product.id, storeId: product.storeId, field, term, position }))
  })
  if (fields.length) await db.insert(searchFieldTerms).values(fields)
  const fieldKey = (row: { field: string; term: string }) => row.field + ":" + row.term
  const oldFields = new Set(previousFields.map(fieldKey)), currentFields = new Set(fields.map(fieldKey))
  for (const row of fields.filter((row) => !oldFields.has(fieldKey(row)))) await db.insert(searchFieldVocabulary).values({ storeId: product.storeId, term: row.term, field: row.field, length: row.term.length, documentFrequency: 1 }).onDuplicateKeyUpdate({ set: { documentFrequency: sql.fromList([searchFieldVocabulary.documentFrequency, sql.raw(" + 1")]) } })
  for (const row of previousFields.filter((row) => !currentFields.has(fieldKey(row)))) await db.update(searchFieldVocabulary).set({ documentFrequency: sql.fromList([sql.raw("GREATEST(0, "), searchFieldVocabulary.documentFrequency, sql.raw(" - 1)")]) }).where(and(eq(searchFieldVocabulary.storeId, product.storeId), eq(searchFieldVocabulary.term, row.term), eq(searchFieldVocabulary.field, row.field)))
  if (words.length) await db.insert(searchDocumentTerms).values(words.map((term) => ({ productId: product.id, term })))
  const skus = [...new Set(document.skus.map((sku) => fold(sku).replace(/\s/g, "").slice(0, 190)).filter(Boolean))]
  if (skus.length) await db.insert(searchSkus).values(skus.map((compact) => ({ storeId: product.storeId, compact, productId: product.id })))
  for (const term of words.filter((word) => !old.has(word))) await db.insert(searchTerms).values({ storeId: product.storeId, term, length: term.length, documentFrequency: 1 }).onDuplicateKeyUpdate({ set: { documentFrequency: sql.fromList([searchTerms.documentFrequency, sql.raw(" + 1")]) } })
  const removed = [...old].filter((word) => !current.has(word))
  if (removed.length) await db.update(searchTerms).set({ documentFrequency: sql.fromList([sql.raw("GREATEST(0, "), searchTerms.documentFrequency, sql.raw(" - 1)")]) }).where(and(eq(searchTerms.storeId, product.storeId), inArray(searchTerms.term, removed)))
}

export async function removeCatalogueSearch(db: Database, storeId: string, productId: string) {
  const fields = await db.select({ term: searchFieldTerms.term, field: searchFieldTerms.field }).from(searchFieldTerms).where(eq(searchFieldTerms.productId, productId)).for("update")
  for (const row of fields) await db.update(searchFieldVocabulary).set({ documentFrequency: sql.fromList([sql.raw("GREATEST(0, "), searchFieldVocabulary.documentFrequency, sql.raw(" - 1)")]) }).where(and(eq(searchFieldVocabulary.storeId, storeId), eq(searchFieldVocabulary.term, row.term), eq(searchFieldVocabulary.field, row.field)))
  const words = await db.select({ term: searchDocumentTerms.term }).from(searchDocumentTerms).where(eq(searchDocumentTerms.productId, productId)).for("update")
  if (words.length) await db.update(searchTerms).set({ documentFrequency: sql.fromList([sql.raw("GREATEST(0, "), searchTerms.documentFrequency, sql.raw(" - 1)")]) }).where(and(eq(searchTerms.storeId, storeId), inArray(searchTerms.term, words.map((row) => row.term))))
}
