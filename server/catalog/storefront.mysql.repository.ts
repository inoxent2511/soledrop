import "server-only"

import { and, asc, count, countDistinct, desc, eq, exists, gt, gte, inArray, isNotNull, like, lte, max, min, notInArray, or, Param, SQL, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/mysql-core"
import type { CollectionRule, Facets } from "./types"
import type { StorefrontQueries, StorefrontRepository } from "./storefront.repository"
import { hydrateProducts } from "./mysql.repository"
import { requireStore } from "@/server/db/actor"
import { database } from "@/server/db/client"
import { mysqlPolicy } from "@/server/db/policy.repository"
import { brands, collectionProducts, collections, inventoryLevels, priceLists, prices, products, productTags, searchDocuments, searchFieldTerms, searchSkus, searchTerms, variants } from "@/server/db/schema"
import { escapeLike, sqlDate } from "@/server/db/values"
import { allowedEdits, expand, fold, terms, wordMatches } from "@/server/search/match"
import { DomainError } from "@/server/shared/errors"

const value = (input: unknown) => new SQL([new Param(input)])
const zero = () => value(0)
const choose = (condition: SQL | undefined, yes: SQL | number, no: SQL | number) => sql.fromList([sql.raw("CASE WHEN "), condition ?? value(false), sql.raw(" THEN "), typeof yes === "number" ? value(yes) : yes, sql.raw(" ELSE "), typeof no === "number" ? value(no) : no, sql.raw(" END")])
const sum = (items: SQL[]) => items.length ? sql.join(items, sql.raw(" + ")) : value(1)
const greatest = (items: SQL[]) => sql.fromList([sql.raw("GREATEST("), sql.join(items, sql.raw(", ")), sql.raw(")")])
// Some shared-engine LIKE range optimizers discard supplementary-plane prefixes. Binary
// byte matching is equivalent for a literal escaped prefix and avoids that range shortcut.
const prefixMatch = (term: string) => /[\u{10000}-\u{10ffff}]/u.test(term)
  ? sql.fromList([sql.raw("BINARY "), searchFieldTerms.term, sql.raw(" LIKE BINARY "), value(escapeLike(term) + "%")])
  : like(searchFieldTerms.term, escapeLike(term) + "%")

/** Indexed public listing projection. Charging and merchandising rules retain their pure implementations. */
export function createMysqlStorefrontRepository(): StorefrontRepository {
  return mysqlPolicy<StorefrontQueries>({
    async related(actor, storeId, product, limit) {
      requireStore(actor, storeId); requireStore(actor, product.storeId)
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DomainError("validation", "Invalid related-products limit.")
      const db = await database()
      const stocked = exists(db.select({ id: variants.id }).from(variants).innerJoin(inventoryLevels, eq(inventoryLevels.variantId, variants.id)).where(and(eq(variants.productId, products.id), gt(inventoryLevels.onHand, inventoryLevels.reserved))))
      const shared = product.collections.length ? exists(db.select({ id: collectionProducts.productId }).from(collectionProducts).innerJoin(collections, eq(collections.id, collectionProducts.collectionId)).where(and(eq(collectionProducts.productId, products.id), eq(collections.storeId, actor.storeId), inArray(collections.slug, product.collections)))) : value(false)
      const rows = await db.select().from(products).where(and(eq(products.storeId, actor.storeId), eq(products.status, "active"), eq(products.kind, product.kind), notInArray(products.id, [product.id]))).orderBy(desc(choose(stocked, 1, 0)), desc(choose(shared, 1, 0)), asc(products.position), asc(products.id)).limit(limit)
      return hydrateProducts(db, actor, rows)
    },
    async selectPage(actor, storeId, query, listIds, collection, synonyms) {
      requireStore(actor, storeId)
      if (collection) requireStore(actor, collection.storeId)
      const pageSize = query.pageSize ?? 9
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new DomainError("validation", "Invalid page size.")
      const db = await database(), at = Date.now()
      const pricing = alias(prices, "resolved_prices"), lists = alias(priceLists, "resolved_lists")
      const quoted = (column: typeof pricing.amount | typeof pricing.compareAt, id: string) => db.select({ value: column }).from(pricing).innerJoin(lists, eq(lists.id, pricing.priceListId)).where(and(eq(pricing.variantId, variants.id), eq(pricing.priceListId, id), eq(lists.storeId, actor.storeId))).limit(1)
      const hasPrice = (id: string) => exists(db.select({ id: pricing.variantId }).from(pricing).innerJoin(lists, eq(lists.id, pricing.priceListId)).where(and(eq(pricing.variantId, variants.id), eq(pricing.priceListId, id), eq(lists.storeId, actor.storeId))))
      const amount = listIds.length ? sql.fromList([sql.raw("COALESCE("), sql.join(listIds.map((id) => quoted(pricing.amount, id)), sql.raw(", ")), sql.raw(", NULL)")]) : value(null)
      const compare = listIds.reduceRight<SQL>((next, id) => choose(hasPrice(id), sql.fromList([sql.raw("("), quoted(pricing.compareAt, id), sql.raw(")")]), next), value(null))
      const offers = db.select({ productId: variants.productId, position: variants.position, amount: amount.mapWith(Number).as("amount"), compare: compare.as("compare_at") }).from(variants).innerJoin(products, eq(products.id, variants.productId)).where(eq(products.storeId, actor.storeId)).as("variant_offers")
      const ranked = db.select({ productId: offers.productId, amount: offers.amount, compare: offers.compare, rank: sql.fromList([sql.raw("ROW_NUMBER() OVER (PARTITION BY "), offers.productId, sql.raw(" ORDER BY "), offers.amount, sql.raw(" ASC, "), offers.position, sql.raw(" ASC)")]).mapWith(Number).as("price_rank") }).from(offers).where(isNotNull(offers.amount)).as("headline_offers")
      const headline = sql.fromList([sql.raw("COALESCE("), ranked.amount, sql.raw(", 0)")]).mapWith(Number)
      const sale = and(isNotNull(ranked.compare), gt(ranked.compare, headline))
      const stocked = exists(db.select({ id: variants.id }).from(variants).innerJoin(inventoryLevels, eq(inventoryLevels.variantId, variants.id)).where(and(eq(variants.productId, products.id), gt(inventoryLevels.onHand, inventoryLevels.reserved))))
      const discounts = choose(sale, sql.fromList([sql.raw("ROUND(("), ranked.compare, sql.raw(" - "), headline, sql.raw(") / "), ranked.compare, sql.raw(" * 100)")]), 0).mapWith(Number)
      const queryTerms = terms(query.q ?? ""), alternatives = queryTerms.flatMap((term) => expand(term, synonyms))
      const fuzzyAlternatives = alternatives.filter((term) => !term.includes(" ") && allowedEdits(term) > 0)
      const dictionary = fuzzyAlternatives.length ? await db.select({ term: searchTerms.term }).from(searchTerms).where(and(eq(searchTerms.storeId, actor.storeId), gt(searchTerms.documentFrequency, 0), or(...fuzzyAlternatives.map((term) => and(gte(searchTerms.length, term.length - allowedEdits(term)), lte(searchTerms.length, term.length + allowedEdits(term))))))) : []
      const fuzzy = (term: string) => dictionary.map((row) => row.term).filter((word) => wordMatches(term, word) === "fuzzy")
      const matchingWord = (term: string) => or(eq(searchFieldTerms.term, term), term.length >= 3 ? prefixMatch(term) : undefined, fuzzy(term).length ? inArray(searchFieldTerms.term, fuzzy(term)) : undefined)
      const fieldScore = (field: "title" | "body", choices: string[]) => {
        const matches = (condition: SQL | undefined) => exists(db.select({ id: searchFieldTerms.productId }).from(searchFieldTerms).where(and(eq(searchFieldTerms.productId, products.id), eq(searchFieldTerms.field, field), condition)))
        const exact = choices.map((term) => term.includes(" ") ? like(sql.fromList([sql.raw("CONCAT(' ', "), field === "title" ? searchDocuments.title : searchDocuments.body, sql.raw(", ' ')")]), "% " + escapeLike(term) + " %") : matches(eq(searchFieldTerms.term, term)))
        const prefixes = choices.filter((term) => !term.includes(" ") && term.length >= 3).map((term) => matches(prefixMatch(term)))
        const edits = [...new Set(choices.filter((term) => !term.includes(" ")).flatMap(fuzzy))]
        return choose(or(...exact), 3, choose(prefixes.length ? or(...prefixes) : value(false), 2.5, choose(edits.length ? matches(inArray(searchFieldTerms.term, edits)) : value(false), 1.5, 0)))
      }
      const sku = exists(db.select({ id: searchSkus.productId }).from(searchSkus).where(and(eq(searchSkus.storeId, actor.storeId), eq(searchSkus.productId, products.id), eq(searchSkus.compact, fold(query.q ?? "").replace(/\s/g, "")))))
      const numeric = queryTerms.filter((term) => /^\d{2}(\.\d)?$/.test(term))
      const termScores = queryTerms.map((term) => {
        const choices = expand(term, synonyms), title = fieldScore("title", choices), body = sql.fromList([sql.raw("("), fieldScore("body", choices), sql.raw(") / 3")])
        const size = /^\d{2}(\.\d)?$/.test(term) ? choose(exists(db.select({ id: variants.id }).from(variants).where(and(eq(variants.productId, products.id), eq(variants.sizeEu, term)))), 1, 0) : zero()
        return greatest([title, body, size])
      })
      const relevance = choose(sku, 10, sum(termScores)).mapWith(Number)
      // FULLTEXT handles normal tokens; indexed field/SKU/size unions cover short terms, stopwords and typos.
      const fulltext = sql.fromList([sql.raw("MATCH("), searchDocuments.title, sql.raw(", "), searchDocuments.body, sql.raw(") AGAINST ("), value(alternatives.flatMap(terms).map((term) => term + "*").join(" ")), sql.raw(" IN BOOLEAN MODE)")])
      const candidateQueries = queryTerms.length ? [
        db.select({ id: searchDocuments.productId }).from(searchDocuments).where(and(eq(searchDocuments.storeId, actor.storeId), gt(fulltext, 0))),
        db.select({ id: searchFieldTerms.productId }).from(searchFieldTerms).innerJoin(products, eq(products.id, searchFieldTerms.productId)).where(and(eq(products.storeId, actor.storeId), or(...alternatives.map((term) => matchingWord(term.includes(" ") ? terms(term)[0] : term))))),
        db.select({ id: searchSkus.productId }).from(searchSkus).where(and(eq(searchSkus.storeId, actor.storeId), eq(searchSkus.compact, fold(query.q ?? "").replace(/\s/g, "")))),
        ...(numeric.length ? [db.select({ id: variants.productId }).from(variants).innerJoin(products, eq(products.id, variants.productId)).where(and(eq(products.storeId, actor.storeId), inArray(variants.sizeEu, numeric)))] : []),
      ] : []
      const candidates = candidateQueries.length ? sql.fromList([sql.raw("("), sql.join(candidateQueries.map((part) => part.getSQL()), sql.raw(" UNION ")), sql.raw(")")]) : undefined
      const rule = (item: CollectionRule): SQL | undefined => {
        switch (item.field) {
          case "kind": return eq(products.kind, item.equals)
          case "gender": return item.in.length ? inArray(products.gender, item.in) : value(false)
          case "tag": return exists(db.select({ id: productTags.id }).from(productTags).where(and(eq(productTags.id, products.id), eq(sql.fromList([sql.raw("BINARY "), productTags.value]), item.equals))))
          case "onSale": return item.equals ? sale : choose(sale, 0, 1)
          case "publishedWithinDays": return gte(products.publishedAt, sqlDate(new Date(at - item.days * 86_400_000).toISOString()))
        }
      }
      const collectionScope = !collection ? undefined : collection.kind === "manual" ? exists(db.select({ id: collectionProducts.productId }).from(collectionProducts).where(and(eq(collectionProducts.productId, products.id), eq(collectionProducts.collectionId, collection.id)))) : collection.rules.length ? and(...collection.rules.map(rule)) : value(false)
      const scope = and(eq(products.storeId, actor.storeId), eq(products.status, "active"), query.kind ? eq(products.kind, query.kind) : undefined, query.excludeIds?.length ? notInArray(products.id, query.excludeIds) : undefined, collectionScope,
        candidates ? sql.fromList([products.id, sql.raw(" IN "), candidates]) : undefined,
        queryTerms.length ? or(sku, and(...termScores.map((term) => gt(term, 0)))) : undefined)
      const scoped = db.select({ id: products.id, title: products.title, kind: products.kind, gender: products.gender, condition: products.conditionGrade, brand: brands.slug, brandName: brands.name, position: products.position, publishedAt: products.publishedAt, amount: headline.as("amount"), discount: discounts.as("discount"), inStock: choose(stocked, 1, 0).mapWith(Number).as("in_stock"), relevance: relevance.as("relevance") }).from(products).innerJoin(brands, and(eq(brands.id, products.brandId), eq(brands.storeId, actor.storeId))).leftJoin(ranked, and(eq(ranked.productId, products.id), eq(ranked.rank, 1))).leftJoin(searchDocuments, eq(searchDocuments.productId, products.id)).where(scope).as("scoped_products")
      const sizeFilter = query.sizes?.length ? exists(db.select({ id: variants.id }).from(variants).innerJoin(inventoryLevels, eq(inventoryLevels.variantId, variants.id)).where(and(eq(variants.productId, scoped.id), inArray(variants.sizeEu, query.sizes), gt(inventoryLevels.onHand, inventoryLevels.reserved)))) : undefined
      const filters = and(query.gender?.length ? or(inArray(scoped.gender, query.gender), eq(scoped.gender, "unisex")) : undefined, sizeFilter, query.brands?.length ? inArray(sql.fromList([sql.raw("BINARY "), scoped.brand]), query.brands) : undefined, query.condition?.length ? inArray(scoped.condition, query.condition) : undefined, query.priceMin !== undefined ? gte(scoped.amount, query.priceMin) : undefined, query.priceMax !== undefined ? lte(scoped.amount, query.priceMax) : undefined)
      const [[total], genders, sizes, brandRows, conditions, [range]] = await Promise.all([
        db.select({ count: count() }).from(scoped).where(filters),
        db.select({ value: scoped.gender, count: count() }).from(scoped).where(sql.fromList([scoped.gender, sql.raw(" <> "), value("unisex")])).groupBy(scoped.gender).orderBy(min(scoped.position)),
        db.select({ value: variants.sizeEu, count: countDistinct(scoped.id) }).from(scoped).innerJoin(variants, eq(variants.productId, scoped.id)).groupBy(variants.sizeEu).orderBy(sql.fromList([sql.raw("CAST("), variants.sizeEu, sql.raw(" AS DECIMAL(10,2))")])),
        db.select({ value: scoped.brand, label: scoped.brandName, count: count() }).from(scoped).groupBy(scoped.brand, scoped.brandName).orderBy(min(scoped.position)),
        db.select({ value: scoped.condition, count: count() }).from(scoped).where(isNotNull(scoped.condition)).groupBy(scoped.condition).orderBy(min(scoped.position)),
        db.select({ min: min(scoped.amount), max: max(scoped.amount) }).from(scoped),
      ])
      const pageCount = Math.max(1, Math.ceil(total.count / pageSize)), page = Math.min(Math.max(1, query.page ?? 1), pageCount)
      const ordering = query.sort === "title-asc" ? [asc(scoped.title), asc(scoped.position)] : query.sort === "title-desc" ? [desc(scoped.title), asc(scoped.position)] : query.sort === "newest" ? [desc(scoped.publishedAt), asc(scoped.position)] : query.sort === "oldest" ? [asc(scoped.publishedAt), asc(scoped.position)] : query.sort === "price-asc" ? [asc(scoped.amount), asc(scoped.position)] : query.sort === "price-desc" ? [desc(scoped.amount), asc(scoped.position)] : query.sort === "discount-desc" ? [desc(scoped.discount), asc(scoped.position)] : query.q ? [desc(scoped.relevance), asc(scoped.position)] : [desc(scoped.inStock), asc(scoped.position)]
      const ids = await db.select({ id: scoped.id }).from(scoped).where(filters).orderBy(...ordering, asc(scoped.id)).limit(pageSize).offset((page - 1) * pageSize)
      const hydrated = ids.length ? await hydrateProducts(db, actor, await db.select().from(products).where(and(eq(products.storeId, actor.storeId), eq(products.status, "active"), inArray(products.id, ids.map((row) => row.id))))) : []
      const facets: Facets = { genders: genders as Facets["genders"], sizes, brands: brandRows, conditions: conditions as Facets["conditions"], price: { min: Number(range?.min ?? 0), max: Number(range?.max ?? 0) } }
      return { products: ids.flatMap((row) => hydrated.find((product) => product.id === row.id) ?? []), total: total.count, page, pageCount, facets }
    },
    async vocabulary(actor, storeId) {
      requireStore(actor, storeId)
      const db = await database()
      const [words, brandRows, groupRows] = await Promise.all([
        db.select({ term: searchFieldTerms.term }).from(searchFieldTerms).innerJoin(products, eq(products.id, searchFieldTerms.productId)).where(and(eq(products.storeId, actor.storeId), eq(products.status, "active"), eq(searchFieldTerms.field, "title"))).groupBy(searchFieldTerms.term).orderBy(min(sql.fromList([products.position, sql.raw(" * 10000 + "), searchFieldTerms.position]))),
        db.select({ name: brands.name }).from(brands).where(eq(brands.storeId, actor.storeId)).orderBy(asc(brands.position)),
        db.select({ title: collections.title }).from(collections).where(eq(collections.storeId, actor.storeId)).orderBy(asc(collections.position)),
      ])
      return [...new Set([...words.map((row) => row.term), ...brandRows.flatMap((row) => terms(row.name)), ...groupRows.flatMap((row) => terms(row.title))])]
    },
  })
}
