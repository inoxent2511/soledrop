import "server-only"

import { and, asc, count, desc, eq, exists, gt, gte, inArray, isNotNull, lte, max, min, not, notInArray, or, Param, SQL, sql } from "drizzle-orm"
import { alias, type MySqlSelect } from "drizzle-orm/mysql-core"
import type { CollectionRule, Facets } from "./types"
import type { StorefrontQueries, StorefrontRepository } from "./storefront.repository"
import { hydrateProducts } from "./mysql.repository"
import { requireStore } from "@/server/db/actor"
import { database, inDatabaseTransaction } from "@/server/db/client"
import { mysqlPolicy } from "@/server/db/policy.repository"
import { brands, collectionProducts, collections, inventoryLevels, priceLists, prices, productListingSizes, productListPrices, products, productTags, searchFieldTerms, variants } from "@/server/db/schema"
import { sqlDate } from "@/server/db/values"
import { terms } from "@/server/search/match"
import { scoredCatalogueCandidates } from "@/server/search/scored-candidates.repository"
import { DomainError } from "@/server/shared/errors"
import { catalogueRevision, readFacetRows } from "./facet-cache.repository"

const value = (input: unknown) => new SQL([new Param(input)])
const choose = (condition: SQL | undefined, yes: SQL | number, no: SQL | number) => sql.fromList([sql.raw("CASE WHEN "), condition ?? value(false), sql.raw(" THEN "), typeof yes === "number" ? value(yes) : yes, sql.raw(" ELSE "), typeof no === "number" ? value(no) : no, sql.raw(" END")])

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
      const cacheRevision = !inDatabaseTransaction() && !collection?.rules.some((rule) => rule.field === "publishedWithinDays") ? await catalogueRevision(db, actor) : undefined
      const pricing = alias(prices, "resolved_prices"), lists = alias(priceLists, "resolved_lists")
      const quoted = (column: typeof pricing.amount | typeof pricing.compareAt, id: string) => db.select({ value: column }).from(pricing).innerJoin(lists, eq(lists.id, pricing.priceListId)).where(and(eq(pricing.variantId, variants.id), eq(pricing.priceListId, id), eq(lists.storeId, actor.storeId))).limit(1)
      const hasPrice = (id: string) => exists(db.select({ id: pricing.variantId }).from(pricing).innerJoin(lists, eq(lists.id, pricing.priceListId)).where(and(eq(pricing.variantId, variants.id), eq(pricing.priceListId, id), eq(lists.storeId, actor.storeId))))
      const amount = listIds.length ? sql.fromList([sql.raw("COALESCE("), sql.join(listIds.map((id) => quoted(pricing.amount, id)), sql.raw(", ")), sql.raw(", NULL)")]) : value(null)
      const compare = listIds.reduceRight<SQL>((next, id) => choose(hasPrice(id), sql.fromList([sql.raw("("), quoted(pricing.compareAt, id), sql.raw(")")]), next), value(null))
      // Correlated offers let count/non-price facets avoid resolving every variant's price.
      // A global window derived table materialized the whole store for each facet query.
      const fallbackOffer = (column: SQL) => db.select({ value: column }).from(variants).where(and(eq(variants.productId, products.id), isNotNull(amount))).orderBy(asc(amount), asc(variants.position)).limit(1)
      const selectedAmount = !listIds.length ? value(null) : fallbackOffer(amount).getSQL()
      const selectedCompare = !listIds.length ? value(null) : fallbackOffer(compare).getSQL()
      const aggregateOffers = alias(productListPrices, "catalogue_offer_heads")
      const headline = (listIds.length === 1 ? sql.fromList([sql.raw("COALESCE("), aggregateOffers.amount, sql.raw(", 0)")]) : sql.fromList([sql.raw("COALESCE(("), selectedAmount, sql.raw("), 0)")])).mapWith(Number)
      const headlineCompare = listIds.length === 1 ? sql.fromList([aggregateOffers.compareAt]) : sql.fromList([sql.raw("("), selectedCompare, sql.raw(")")])
      const sale = and(isNotNull(headlineCompare), gt(headlineCompare, headline))
      const stocked = exists(db.select({ id: variants.id }).from(variants).innerJoin(inventoryLevels, eq(inventoryLevels.variantId, variants.id)).where(and(eq(variants.productId, products.id), gt(inventoryLevels.onHand, inventoryLevels.reserved))))
      const discounts = choose(sale, sql.fromList([sql.raw("ROUND(("), headlineCompare, sql.raw(" - "), headline, sql.raw(") / "), headlineCompare, sql.raw(" * 100)")]), 0).mapWith(Number)
      const queryTerms = terms(query.q ?? "")
      const search = await scoredCatalogueCandidates(db, actor.storeId, query.q ?? "", synonyms), candidates = search?.source
      const relevance = candidates ? sql.raw("catalogue_search_candidates.relevance").mapWith(Number) : sql.raw("(1 + 0)")
      const root = candidates ?? products
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
      const scope = and(eq(products.storeId, actor.storeId), eq(products.status, "active"), query.kind ? eq(products.kind, query.kind) : undefined, query.excludeIds?.length ? notInArray(products.id, query.excludeIds) : undefined, collectionScope)
      // Select only what a query consumes: scalar SELECT columns prevent derived-table merging
      // on both engines, otherwise even gender/count facets calculate every price and stock flag.
      const brandScope = and(eq(brands.id, products.brandId), eq(brands.storeId, actor.storeId))
      function joinSources<T extends MySqlSelect>(builder: T, needsPrice: boolean, productsFirst = false, needsBrand = true) {
        const withProducts = candidates && !productsFirst ? builder.innerJoin(products, eq(products.id, sql.raw("catalogue_search_candidates.id")), { forceIndex: "products_listing_by_id" }) : builder
        const withScores = candidates && productsFirst ? withProducts.innerJoin(candidates, eq(products.id, sql.raw("catalogue_search_candidates.id"))) : withProducts
        const withBrand = needsBrand ? withScores.innerJoin(brands, brandScope) : withScores
        return listIds.length === 1 && needsPrice ? withBrand.leftJoin(aggregateOffers, and(eq(aggregateOffers.productId, products.id), eq(aggregateOffers.storeId, actor.storeId), eq(aggregateOffers.priceListId, listIds[0]), exists(db.select({ id: priceLists.id }).from(priceLists).where(and(eq(priceLists.id, listIds[0]), eq(priceLists.storeId, actor.storeId)))))) : withBrand
      }
      const scopeNeedsPrice = Boolean(collection?.rules.some((item) => item.field === "onSale")), filterNeedsPrice = query.priceMin !== undefined || query.priceMax !== undefined
      const sizeFilter = query.sizes?.length ? exists(db.select({ id: variants.id }).from(variants).innerJoin(inventoryLevels, eq(inventoryLevels.variantId, variants.id)).where(and(eq(variants.productId, products.id), inArray(variants.sizeEu, query.sizes), gt(inventoryLevels.onHand, inventoryLevels.reserved)))) : undefined
      const filters = and(query.gender?.length ? or(inArray(products.gender, query.gender), eq(products.gender, "unisex")) : undefined, sizeFilter, query.brands?.length ? inArray(sql.fromList([sql.raw("BINARY "), brands.slug]), query.brands) : undefined, query.condition?.length ? inArray(products.conditionGrade, query.condition) : undefined, query.priceMin !== undefined ? gte(headline, query.priceMin) : undefined, query.priceMax !== undefined ? lte(headline, query.priceMax) : undefined)
      const uniqueSizes = productListingSizes
      const facetHints = !candidates ? { forceIndex: "products_store_status_facets" } : undefined
      // MariaDB otherwise starts with each brand and rescans the entire store's product range.
      const sizeValue = sql.fromList([sql.raw("STRAIGHT_JOIN "), uniqueSizes.size]).mapWith(String)
      const pageId = sql.fromList([sql.raw("STRAIGHT_JOIN "), products.id]).mapWith(products.id)
      const groupGender = candidates ? sql.fromList([sql.raw("STRAIGHT_JOIN "), products.gender]).mapWith(String) : products.gender
      const pageHints = queryTerms.length ? undefined : { forceIndex: query.sort === "newest" || query.sort === "oldest" ? "products_store_status_newest" : !query.sort || query.sort === "featured" ? "products_store_status_position" : "products_store_status_facets" }
      const hasFilters = Boolean(query.gender?.length || query.sizes?.length || query.brands?.length || query.condition?.length || filterNeedsPrice)
      const ordering = query.sort === "title-asc" ? [asc(products.title), asc(products.position)] : query.sort === "title-desc" ? [desc(products.title), asc(products.position)] : query.sort === "newest" ? [desc(products.publishedAt), asc(products.position)] : query.sort === "oldest" ? [asc(products.publishedAt), asc(products.position)] : query.sort === "price-asc" ? [asc(headline), asc(products.position)] : query.sort === "price-desc" ? [desc(headline), asc(products.position)] : query.sort === "discount-desc" ? [desc(discounts), asc(products.position)] : query.q ? search?.constantRelevance ? [asc(products.position)] : [desc(relevance), asc(products.position)] : [desc(choose(stocked, 1, 0)), asc(products.position)]
      const productsFirst = Boolean(search?.constantRelevance) && (!query.sort || query.sort === "featured")
      const ordinaryPage = (offset: number) => joinSources(db.select({ id: pageId }).from(productsFirst ? products : root, productsFirst ? { forceIndex: "products_store_status_position" } : pageHints).$dynamic(), scopeNeedsPrice || filterNeedsPrice || ["price-asc", "price-desc", "discount-desc"].includes(query.sort ?? ""), productsFirst).where(and(scope, filters)).orderBy(...ordering, asc(products.id)).limit(pageSize).offset(offset)
      async function selectPageIds(offset: number) {
        if (offset !== 0 || query.q || listIds.length !== 1 || !["price-asc", "price-desc"].includes(query.sort ?? "")) return ordinaryPage(offset)
        const totalProducts = db.select({ count: count() }).from(products).where(eq(products.storeId, actor.storeId))
        const [coverage] = await db.select({ prices: count(), products: sql.fromList([sql.raw("("), totalProducts.getSQL(), sql.raw(")")]).mapWith(Number) }).from(aggregateOffers, { forceIndex: "listing_prices_scope" }).where(and(eq(aggregateOffers.storeId, actor.storeId), eq(aggregateOffers.priceListId, listIds[0])))
        if (coverage.prices !== coverage.products) return ordinaryPage(offset)
        function priceSources<T extends MySqlSelect>(builder: T) {
          return builder.innerJoin(products, eq(products.id, aggregateOffers.productId), { forceIndex: "products_listing_by_id" }).innerJoin(brands, brandScope)
        }
        const eligible = and(scope, filters, eq(aggregateOffers.storeId, actor.storeId), eq(aggregateOffers.priceListId, listIds[0]), exists(db.select({ id: priceLists.id }).from(priceLists).where(and(eq(priceLists.id, listIds[0]), eq(priceLists.storeId, actor.storeId)))))
        const ascending = query.sort === "price-asc"
        const bounds = await priceSources(db.select({ amount: sql.fromList([sql.raw("STRAIGHT_JOIN "), aggregateOffers.amount]).mapWith(Number) }).from(aggregateOffers, { forceIndex: "listing_prices_list_amount" }).$dynamic()).where(eligible).orderBy(ascending ? asc(aggregateOffers.amount) : desc(aggregateOffers.amount)).limit(pageSize)
        if (!bounds.length) return []
        const bound = bounds.at(-1)!.amount
        // Include the entire boundary-price tie before position ordering.
        return priceSources(db.select({ id: pageId }).from(aggregateOffers, { forceIndex: "listing_prices_list_amount" }).$dynamic()).where(and(eligible, ascending ? lte(aggregateOffers.amount, bound) : gte(aggregateOffers.amount, bound))).orderBy(...ordering, asc(products.id)).limit(pageSize)
      }
      // Page one never needs clamping, so its independent read can overlap facets.
      const firstPage = (query.page ?? 1) <= 1 && (query.q || query.sort && query.sort !== "featured") ? selectPageIds(0) : undefined
      const sizesQuery = joinSources(db.select({ value: sizeValue, count: count() }).from(root, facetHints).$dynamic(), scopeNeedsPrice, false, false).innerJoin(uniqueSizes, and(eq(uniqueSizes.productId, products.id), eq(uniqueSizes.storeId, actor.storeId))).where(scope).groupBy(uniqueSizes.size).orderBy(sql.fromList([sql.raw("CAST("), uniqueSizes.size, sql.raw(" AS DECIMAL(10,2))")]))
      const facetScope = { listIds, collection: collection ? { id: collection.id, kind: collection.kind, rules: collection.rules } : null, kind: query.kind, excludeIds: query.excludeIds, q: query.q, synonyms: [...synonyms] }
      const facetRows = () => readFacetRows(db, actor, facetScope, cacheRevision, async () => {
        const [groups, sizes] = await Promise.all([
          joinSources(db.select({ gender: groupGender, brandId: products.brandId, condition: products.conditionGrade, count: count(), min: min(headline), max: max(headline) }).from(root, facetHints).$dynamic(), true, false, false).where(scope).groupBy(products.gender, products.brandId, products.conditionGrade).orderBy(min(products.position)),
          sizesQuery,
        ])
        return { groups, sizes }
      })
      const [[filteredTotal], { groups, sizes }, firstIds] = await Promise.all([
        hasFilters ? joinSources(db.select({ count: count() }).from(root, facetHints).$dynamic(), scopeNeedsPrice || filterNeedsPrice).where(and(scope, filters)) : Promise.resolve([{ count: 0 }]),
        facetRows(),
        firstPage ?? Promise.resolve(undefined),
      ])
      // One grouped pass supplies the marginal facets and total instead of rescanning the
      // catalogue independently for gender, brand, condition, range and the unfiltered count.
      const genders = new Map<string, { value: string; count: number }>(), brandRows = new Map<string, { value: string; label: string; count: number }>(), conditions = new Map<string, { value: string; count: number }>()
      const brandLabels = new Map<string, { slug: string; name: string }>(), brandIds = [...new Set(groups.map((row) => row.brandId))]
      for (let start = 0; start < brandIds.length; start += 500) {
        const rows = await db.select({ id: brands.id, slug: brands.slug, name: brands.name }).from(brands).where(and(eq(brands.storeId, actor.storeId), inArray(brands.id, brandIds.slice(start, start + 500))))
        for (const row of rows) brandLabels.set(row.id, row)
      }
      let baseTotal = 0, priceMin = Infinity, priceMax = -Infinity
      for (const group of groups) {
        baseTotal += group.count
        priceMin = Math.min(priceMin, Number(group.min)); priceMax = Math.max(priceMax, Number(group.max))
        if (group.gender !== "unisex") {
          const facet = genders.get(group.gender) ?? { value: group.gender, count: 0 }
          facet.count += group.count; genders.set(group.gender, facet)
        }
        const label = brandLabels.get(group.brandId)
        if (!label) throw new DomainError("unavailable", "The catalogue changed. Please refresh and try again.")
        const brand = brandRows.get(label.slug) ?? { value: label.slug, label: label.name, count: 0 }
        brand.count += group.count; brandRows.set(label.slug, brand)
        if (group.condition !== null) {
          const facet = conditions.get(group.condition) ?? { value: group.condition, count: 0 }
          facet.count += group.count; conditions.set(group.condition, facet)
        }
      }
      const total = hasFilters ? filteredTotal.count : baseTotal
      const pageCount = Math.max(1, Math.ceil(total / pageSize)), page = Math.min(Math.max(1, query.page ?? 1), pageCount)
      const offset = (page - 1) * pageSize
      let ids: { id: string }[]
      if (!query.q && (!query.sort || query.sort === "featured")) {
        // Read stocked rows in the existing position index, stopping as soon as the page fills.
        // Sorting a computed EXISTS flag forced every product's stock to be read first.
        ids = await joinSources(db.select({ id: pageId }).from(products, pageHints).$dynamic(), scopeNeedsPrice || filterNeedsPrice).where(and(scope, filters, stocked)).orderBy(asc(products.position), asc(products.id)).limit(pageSize).offset(offset)
        if (ids.length < pageSize) {
          const stockedTotal = offset === 0 ? ids.length : ids.length ? offset + ids.length : (await joinSources(db.select({ count: count() }).from(products).$dynamic(), scopeNeedsPrice || filterNeedsPrice).where(and(scope, filters, stocked)))[0].count
          const remainder = await joinSources(db.select({ id: pageId }).from(products, pageHints).$dynamic(), scopeNeedsPrice || filterNeedsPrice).where(and(scope, filters, not(stocked), ids.length ? notInArray(products.id, ids.map((row) => row.id)) : undefined)).orderBy(asc(products.position), asc(products.id)).limit(pageSize - ids.length).offset(Math.max(0, offset - stockedTotal))
          ids.push(...remainder)
        }
      } else ids = firstIds ?? await selectPageIds(offset)
      const hydrated = ids.length ? await hydrateProducts(db, actor, await db.select().from(products).where(and(eq(products.storeId, actor.storeId), eq(products.status, "active"), inArray(products.id, ids.map((row) => row.id))))) : []
      const facets: Facets = { genders: [...genders.values()] as Facets["genders"], sizes, brands: [...brandRows.values()], conditions: [...conditions.values()] as Facets["conditions"], price: { min: groups.length ? priceMin : 0, max: groups.length ? priceMax : 0 } }
      return { products: ids.flatMap((row) => hydrated.find((product) => product.id === row.id) ?? []), total, page, pageCount, facets }
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
