import "server-only"

import { and, eq, inArray, sql } from "drizzle-orm"
import type { Product } from "@/server/catalog/types"
import type { Database } from "@/server/db/client"
import { searchDocuments, searchDocumentTerms, searchFieldTerms, searchSkus, searchTerms } from "@/server/db/schema"
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
    return [...positions].map(([term, position]) => ({ productId: product.id, field, term, position }))
  })
  if (fields.length) await db.insert(searchFieldTerms).values(fields)
  if (words.length) await db.insert(searchDocumentTerms).values(words.map((term) => ({ productId: product.id, term })))
  const skus = [...new Set(document.skus.map((sku) => fold(sku).replace(/\s/g, "").slice(0, 190)).filter(Boolean))]
  if (skus.length) await db.insert(searchSkus).values(skus.map((compact) => ({ storeId: product.storeId, compact, productId: product.id })))
  for (const term of words.filter((word) => !old.has(word))) await db.insert(searchTerms).values({ storeId: product.storeId, term, length: term.length, documentFrequency: 1 }).onDuplicateKeyUpdate({ set: { documentFrequency: sql.fromList([searchTerms.documentFrequency, sql.raw(" + 1")]) } })
  const removed = [...old].filter((word) => !current.has(word))
  if (removed.length) await db.update(searchTerms).set({ documentFrequency: sql.fromList([sql.raw("GREATEST(0, "), searchTerms.documentFrequency, sql.raw(" - 1)")]) }).where(and(eq(searchTerms.storeId, product.storeId), inArray(searchTerms.term, removed)))
}

export async function removeCatalogueSearch(db: Database, storeId: string, productId: string) {
  const words = await db.select({ term: searchDocumentTerms.term }).from(searchDocumentTerms).where(eq(searchDocumentTerms.productId, productId)).for("update")
  if (words.length) await db.update(searchTerms).set({ documentFrequency: sql.fromList([sql.raw("GREATEST(0, "), searchTerms.documentFrequency, sql.raw(" - 1)")]) }).where(and(eq(searchTerms.storeId, storeId), inArray(searchTerms.term, words.map((row) => row.term))))
}
