import "server-only"

import { cache } from "react"

import { menuOptions, popularCollections, popularSearches, primaryNav, tabGender } from "@/content/navigation"
import type { FilterOptions } from "@/features/catalog/types/filters"
import type { MenuSection } from "@/features/navigation/types"
import type { SuggestProduct, SuggestResponse } from "@/features/search/types"
import { conditionLabel, formatPrice } from "@/lib/format"
import { catalog } from "@/server/catalog"
import { CONDITION_GRADES, type ProductQuery, type ProductView } from "@/server/catalog/types"
import { contentService } from "@/server/content"
import { currentStoreId } from "@/server/db/driver"
import type { PricingContext } from "@/server/pricing/service"
import { searchService } from "@/server/search"
import { fold, score, suggestSpelling } from "@/server/search/match"
import type { SearchSource } from "@/server/search/types"
import { shippingRepository } from "@/server/shipping"

/**
 * Catalogue pages render with retail (guest) pricing so they can be cached and shared; group
 * prices for signed-in B2B customers are applied in the bag and at checkout, which are always
 * priced per shopper (docs/app/caching.md).
 */
export function retailContext(): PricingContext {
  return { storeId: currentStoreId(), customerGroup: null }
}

export const getProduct = cache(async (slug: string) => catalog().getProduct(slug, retailContext()))

export const getCollection = cache(async (slug: string) => catalog().getCollection(currentStoreId(), slug))

/** Everything the Home page lists, in one pass over the catalogue. */
export async function homeData() {
  const service = catalog()
  const context = retailContext()
  const [newArrivals, newestPreloved, brandNew, preloved, featuredNew, featuredPreloved] = await Promise.all([
    service.queryProducts({ collection: "new-arrivals", pageSize: 4 }, context),
    // The New Arrival row's Pre-Loved side (D-075): the newest listings, as the New Arrivals page counts them.
    service.queryProducts({ kind: "preloved", sort: "newest", pageSize: 4 }, context),
    // Brand New Drops (D-076): the brand-new range in featured order, like Pre-Loved Drops.
    service.queryProducts({ collection: "brand-new", pageSize: 4 }, context),
    service.queryProducts({ kind: "preloved", pageSize: 4 }, context),
    service.queryProducts({ collection: "featured", kind: "new", pageSize: 1 }, context),
    service.queryProducts({ collection: "featured", kind: "preloved", pageSize: 1 }, context),
  ])
  // The Featured Drop slider: one brand-new and one pre-loved pair from the "featured" collection (D-048).
  const featured = [featuredNew.items[0], featuredPreloved.items[0]].filter((item) => item !== undefined)
  return { newArrivals: newArrivals.items, newestPreloved: newestPreloved.items, brandNew: brandNew.items, preloved: preloved.items, featured }
}

/** How many pairs each New Arrivals tab loads; the page reveals them a few rows at a time (D-052). */
export const ARRIVALS_LIMIT = 24

/** The New Arrivals page: its banner collection and the newest brand-new and pre-loved pairs. */
export async function newArrivalsData() {
  const service = catalog()
  const context = retailContext()
  const [collection, brandNew, preloved] = await Promise.all([
    getCollection("new-arrivals"),
    service.queryProducts({ collection: "new-arrivals", kind: "new", sort: "newest", pageSize: ARRIVALS_LIMIT }, context),
    // One-off pre-loved pairs never join the new-arrivals collection (D-045): the newest listings are the arrivals.
    service.queryProducts({ kind: "preloved", sort: "newest", pageSize: ARRIVALS_LIMIT }, context),
  ])
  return { collection, brandNew, preloved }
}

/** Every pair on sale, so the Sale page never needs a second listing behind it (D-053). */
export const SALE_LIMIT = 500

/**
 * The Sale page (D-053): the rule-based "sale" collection (any pair whose compare-at price is above
 * its price, new or pre-loved), split into its brand-new and pre-loved pairs, newest first.
 */
export async function saleData() {
  const service = catalog()
  const context = retailContext()
  const [collection, brandNew, preloved] = await Promise.all([
    getCollection("sale"),
    service.queryProducts({ collection: "sale", kind: "new", sort: "newest", pageSize: SALE_LIMIT }, context),
    service.queryProducts({ collection: "sale", kind: "preloved", sort: "newest", pageSize: SALE_LIMIT }, context),
  ])
  return { collection, brandNew, preloved }
}

/** Collections served by a page of their own instead of /collections/<slug>. */
export const DEDICATED_COLLECTION_PAGES: Record<string, string> = { "pre-loved": "/pre-loved", sale: "/sale" }

/** Where a collection lives on the storefront. */
export const collectionHref = (slug: string) => DEDICATED_COLLECTION_PAGES[slug] ?? `/collections/${slug}`

/** The adult EU run the size filter always offers (design: 38–45); sizes stocked outside it are added. */
const STANDARD_EU_SIZES = ["38", "39", "40", "41", "42", "43", "44", "45"]

/**
 * A listing page: the collection (null when the slug is unknown), one page of results and the
 * filter options. Brands come from the store's brand list so a filter never disappears just
 * because another filter emptied it; sizes and the price bounds come from the unfiltered scope.
 */
export async function listingData(query: ProductQuery & { collection: string }) {
  const collection = await getCollection(query.collection)
  if (!collection) return null
  return { collection, ...(await resultsWithFilters(query)) }
}

/** Search results (any query, no collection scope) with the same filters as a listing. */
export async function searchData(query: ProductQuery) {
  return resultsWithFilters(query)
}

async function resultsWithFilters(query: ProductQuery) {
  const service = catalog()
  const [brands, results] = await Promise.all([service.brands(currentStoreId()), service.queryProducts(query, retailContext())])
  const { price, sizes, conditions } = results.facets
  const filters: FilterOptions = {
    conditions: CONDITION_GRADES.flatMap((grade) => {
      const count = conditions.find((entry) => entry.value === grade)?.count
      return count ? [{ value: grade, label: conditionLabel(grade), count }] : []
    }),
    sizes: [...new Set([...STANDARD_EU_SIZES, ...sizes.map((size) => size.value)])].sort((a, b) => Number(a) - Number(b)),
    brands: [...brands].sort((a, b) => a.position - b.position).map((brand) => ({ value: brand.slug, label: brand.name })),
    price: { min: Math.floor(price.min / 100_000) * 1000, max: Math.ceil(price.max / 100_000) * 1000 },
  }
  return { results, filters }
}

/** Lowest subtotal at which standard delivery becomes free in the store's first zone; null when it never does. */
export const freeDeliveryThreshold = cache(async () => {
  const zones = await shippingRepository().listZones(currentStoreId())
  const first = [...zones].sort((a, b) => a.position - b.position)[0]
  const thresholds = (first?.rates ?? []).flatMap((rate) => (rate.freeOver === null ? [] : [rate.freeOver]))
  return thresholds.length ? Math.min(...thresholds) : null
})

/** A delivery rate as the Shipping & Delivery Policy shows it (D-056). */
export type DeliveryRate = { code: string; label: string; amount: number; freeOver: number | null; cashOnDelivery: boolean }

/**
 * The live delivery rates of the store's first zone, and the "Standard shipping" line built from its
 * standard rate, so the policy always states what checkout charges. Null text when no rate exists.
 */
export const deliveryRates = cache(async (): Promise<{ rates: DeliveryRate[]; standardShipping: string | null }> => {
  const zones = await shippingRepository().listZones(currentStoreId())
  const zone = [...zones].sort((a, b) => a.position - b.position)[0]
  const rates = (zone?.rates ?? []).map(({ code, label, amount, freeOver, cashOnDelivery }) => ({ code, label, amount, freeOver, cashOnDelivery }))
  const standard = rates.find((rate) => rate.code === "standard") ?? rates[0]
  if (!standard) return { rates, standardShipping: null }
  const price = standard.amount === 0 ? "free" : `${formatPrice(standard.amount, "PKR", { symbol: true })} per order`
  const free = standard.amount > 0 && standard.freeOver !== null ? `, free on orders above ${formatPrice(standard.freeOver, "PKR", { symbol: true })}` : ""
  return { rates, standardShipping: `${price}${free}` }
})

/**
 * The product page: the product, four related pairs, the delivery promise and the live delivery rate
 * for the Delivery panel's policy excerpt (D-056). Null when the slug is unknown.
 */
export async function productPageData(slug: string) {
  const product = await getProduct(slug)
  if (!product || product.status !== "active") return null
  const storeId = currentStoreId()
  const service = catalog()
  const [related, attributes, freeDeliveryOver, delivery] = await Promise.all([
    service.related(product, retailContext()),
    service.attributeDefinitions(storeId),
    freeDeliveryThreshold(),
    deliveryRates(),
  ])
  /** Product-level attributes with their merchant labels, in definition order ("Colour: Black / Silver"). */
  const details = [...attributes]
    .filter((definition) => definition.scope === "product" && product.attributes[definition.code] !== undefined)
    .sort((a, b) => a.position - b.position)
    .map((definition) => {
      const value = product.attributes[definition.code]
      const option = (raw: string) => definition.options?.find((entry) => entry.value === raw)?.label ?? raw
      const text = Array.isArray(value) ? value.map(option).join(", ") : typeof value === "boolean" ? (value ? "Yes" : "No") : option(String(value))
      return { label: definition.label, value: text }
    })
  return { product, related, details, freeDeliveryOver, standardShipping: delivery.standardShipping }
}

/** FAQs grouped by category, each with a stable anchor id for the jump links. */
export const faqPageData = cache(async () => {
  const groups = await contentService().faqsByCategory(currentStoreId())
  return groups.map((group) => ({ ...group, anchor: group.category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }))
})

/** A content page (policies, About, Our Story); null when unknown. */
export const getContentPage = cache(async (slug: string) => contentService().page(currentStoreId(), slug))

/** The trimmed product the search overlay and mega menus show. */
export function toSuggestProduct(product: ProductView): SuggestProduct {
  const image = product.images[0]
  return {
    slug: product.slug,
    title: product.title,
    brand: product.brand.name,
    kind: product.kind,
    condition: product.condition ? conditionLabel(product.condition) : null,
    image: image ? { url: image.url, alt: image.alt } : null,
    price: { amount: product.price.amount, compareAt: product.price.compareAt, currency: product.price.currency },
    inStock: product.inStock,
  }
}

const SUGGEST_PRODUCTS = 8
const SUGGEST_LINKS = 4
const SUGGEST_COMPLETIONS = 5
export const MIN_QUERY_LENGTH = 2

const nameOnly = (title: string) => ({ title, body: "", skus: [], sizes: [] })

/**
 * The search overlay's data for one query. Empty or one-letter queries return the landing panel
 * (trending searches, popular collections); a query with no matches adds "did you mean" and
 * popular pairs. Prices are retail, like every catalogue page.
 */
export async function searchSuggest(rawQuery: string): Promise<SuggestResponse> {
  const query = rawQuery.trim().slice(0, 80)
  const storeId = currentStoreId()
  const service = catalog()
  const search = searchService()
  const trendingQueries = search.trending(storeId, popularSearches).then((rows) => rows.map((row) => row.query))
  const empty: SuggestResponse = { query, total: 0, suggestions: [], collections: [], brands: [], products: [], didYouMean: null, trending: [], popular: [] }

  if (fold(query).length < MIN_QUERY_LENGTH) {
    return { ...empty, trending: await trendingQueries, collections: popularCollections }
  }

  const [page, collections, brands, synonyms, trending] = await Promise.all([
    service.queryProducts({ q: query, pageSize: SUGGEST_PRODUCTS }, retailContext()),
    service.collections(storeId),
    service.brands(storeId),
    search.synonymMap(storeId),
    trendingQueries,
  ])
  const collectionLinks = collections
    .filter((collection) => collection.slug !== "featured" && score(nameOnly(collection.title), query, synonyms) > 0)
    .sort((a, b) => a.position - b.position)
    .slice(0, SUGGEST_LINKS)
    .map((collection) => ({ label: collection.title, href: collectionHref(collection.slug) }))
  const brandLinks = brands
    .filter((brand) => score(nameOnly(brand.name), query, synonyms) > 0)
    .sort((a, b) => a.position - b.position)
    .slice(0, SUGGEST_LINKS)
    .map((brand) => ({ label: brand.name, href: `/search?brand=${brand.slug}` }))
  const folded = fold(query)
  const completions = [...trending.filter((entry) => entry.startsWith(folded)), ...page.items.map((product) => product.title)]
  const suggestions = [...new Map(completions.map((text) => [fold(text), text])).values()].filter((text) => fold(text) !== folded).slice(0, SUGGEST_COMPLETIONS)
  const result: SuggestResponse = { ...empty, total: page.total, suggestions, collections: collectionLinks, brands: brandLinks, products: page.items.map(toSuggestProduct) }
  if (page.total > 0 || collectionLinks.length > 0 || brandLinks.length > 0) return result

  const [vocabulary, popular] = await Promise.all([service.vocabulary(storeId, query), service.queryProducts({ collection: "new-arrivals", pageSize: 4 }, retailContext())])
  return { ...result, didYouMean: suggestSpelling(query, vocabulary), trending, popular: popular.items.map(toSuggestProduct) }
}

/** "Did you mean" and popular pairs for the /search page when a query finds nothing. */
export async function noResultsHelp(query: string) {
  const service = catalog()
  const [vocabulary, popular, trending] = await Promise.all([
    service.vocabulary(currentStoreId(), query),
    service.queryProducts({ collection: "new-arrivals", pageSize: 4 }, retailContext()),
    searchService().trending(currentStoreId(), popularSearches),
  ])
  return { didYouMean: suggestSpelling(query, vocabulary), popular: popular.items, trending: trending.map((row) => row.query) }
}

/** Records a search (with its result count) or a result click; logging never fails the page. */
export async function logSearchEvent(event: { query: string; source: SearchSource } & ({ resultCount: number } | { slug: string })) {
  try {
    const search = searchService()
    if ("slug" in event) await search.logClick(currentStoreId(), event.query, event.slug, event.source)
    else await search.logSearch(currentStoreId(), event.query, event.resultCount, event.source)
  } catch (error) {
    console.error("search log failed", error)
  }
}

/** How many products a query finds (the server's count, so a logged result count is never the client's word). */
export async function searchCount(query: string): Promise<number> {
  return (await catalog().queryProducts({ q: query, pageSize: 1 }, retailContext())).total
}

/**
 * The header dropdowns (D-045): per primary-nav item, where its Brand New and Pre-Loved choices
 * lead. A direct item (New Arrival, D-052) has no choices: it is a plain link to its own page.
 */
export const navigationData = cache(async (): Promise<MenuSection[]> =>
  primaryNav.map((link) => {
    // D-067: a gendered tab opens both choices with that Gender filter already ticked.
    const gender = tabGender[link.href]
    const withGender = gender ? `&gender=${gender}` : ""
    return {
      label: link.label,
      href: link.href,
      tone: link.tone,
      options: link.direct
        ? []
        : menuOptions.map((option) => ({
            kind: option.kind,
            label: option.label,
            href: option.kind === "preloved" ? (gender ? `/pre-loved?gender=${gender}` : `${link.href}?kind=preloved`) : `${link.href}?kind=new${withGender}`,
          })),
    }
  }),
)

export function stockByVariant(product: ProductView): Record<string, number> {
  return Object.fromEntries(product.stock.map((level) => [level.variantId, level.available]))
}
