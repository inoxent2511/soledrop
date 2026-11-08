import "server-only"
import { searchable } from "@/server/search/document"

import type { CatalogOperations } from "@/server/catalog/repository"
import type { StorefrontSelection } from "./storefront.repository"
import type {
  Collection,
  Facets,
  Gender,
  Product,
  ProductPage,
  ProductQuery,
  ProductView,
  StockLevel,
  VariantPrice,
} from "@/server/catalog/types"
import type { InventoryOperations } from "@/server/inventory/repository"
import type { PricingContext, PricingService } from "@/server/pricing/service"
import { matchesAllRules } from "@/server/rules/engine"
import { score, terms, type SynonymMap } from "@/server/search/match"
import { discountPercent } from "@/server/shared/money"

export const DEFAULT_PAGE_SIZE = 9

type Deps = {
  catalog: CatalogOperations
  pricing: PricingService
  inventory: InventoryOperations
  /** Merchant synonym groups for search (server/search); none when omitted. */
  synonyms?: (storeId: string) => Promise<SynonymMap>
  selectPage?: (query: ProductQuery, context: PricingContext) => Promise<StorefrontSelection>
  indexedVocabulary?: (storeId: string) => Promise<string[]>
  selectRelated?: (product: ProductView, context: PricingContext, limit: number) => Promise<Product[]>
}

/** Lowest-priced variant's price is the product's card price. */
function headlinePrice(prices: VariantPrice[]): ProductView["price"] {
  const cheapest = [...prices].sort((a, b) => a.amount - b.amount)[0]
  if (!cheapest) return { amount: 0, compareAt: null, currency: "PKR", discountPercent: null }
  return { amount: cheapest.amount, compareAt: cheapest.compareAt, currency: cheapest.currency, discountPercent: discountPercent(cheapest.amount, cheapest.compareAt) }
}

export { searchable } from "@/server/search/document"

function computeFacets(items: ProductView[]): Facets {
  const count = <T extends string>(values: T[]) => {
    const map = new Map<T, number>()
    for (const value of values) map.set(value, (map.get(value) ?? 0) + 1)
    return map
  }
  const genders = count(items.map((item) => item.gender).filter((gender): gender is Gender => gender !== "unisex"))
  const sizes = count(items.flatMap((item) => [...new Set(item.variants.map((variant) => variant.size.eu))]))
  const brandMap = new Map<string, { label: string; count: number }>()
  for (const item of items) {
    const entry = brandMap.get(item.brand.slug) ?? { label: item.brand.name, count: 0 }
    entry.count += 1
    brandMap.set(item.brand.slug, entry)
  }
  const conditions = count(items.flatMap((item) => (item.condition ? [item.condition] : [])))
  const amounts = items.map((item) => item.price.amount)
  return {
    genders: [...genders].map(([value, total]) => ({ value, count: total })),
    sizes: [...sizes].map(([value, total]) => ({ value, count: total })).sort((a, b) => Number(a.value) - Number(b.value)),
    brands: [...brandMap].map(([value, entry]) => ({ value, label: entry.label, count: entry.count })),
    price: { min: amounts.length ? Math.min(...amounts) : 0, max: amounts.length ? Math.max(...amounts) : 0 },
    conditions: [...conditions].map(([value, total]) => ({ value, count: total })),
  }
}

export function createCatalogService({ catalog, pricing, inventory, synonyms = async () => new Map(), selectPage, indexedVocabulary, selectRelated }: Deps) {
  async function enrich(products: Product[], context: PricingContext): Promise<ProductView[]> {
    const variantIds = products.flatMap((product) => product.variants.map((variant) => variant.id))
    const [prices, stock] = await Promise.all([pricing.pricesFor(variantIds, context), inventory.availability(variantIds)])
    return products.map((product) => {
      const productPrices = product.variants.flatMap((variant) => {
        const price = prices.get(variant.id)
        return price ? [price] : []
      })
      const productStock: StockLevel[] = product.variants.map((variant) => ({ variantId: variant.id, available: Math.max(0, stock.get(variant.id) ?? 0) }))
      return {
        ...product,
        prices: productPrices,
        stock: productStock,
        price: headlinePrice(productPrices),
        inStock: productStock.some((level) => level.available > 0),
      }
    })
  }

  function inCollection(product: ProductView, collection: Collection) {
    return collection.kind === "rule" ? matchesAllRules(product, collection.rules) : product.collections.includes(collection.slug)
  }

  async function collections(storeId: string) {
    return catalog.listCollections(storeId)
  }

  return {
    collections,

    async getCollection(storeId: string, slug: string) {
      return (await collections(storeId)).find((collection) => collection.slug === slug) ?? null
    },

    brands: (storeId: string) => catalog.listBrands(storeId),
    attributeDefinitions: (storeId: string) => catalog.listAttributeDefinitions(storeId),
    customFieldDefinitions: (storeId: string) => catalog.listCustomFieldDefinitions(storeId),

    /** Filter, search, facet, sort and paginate. Facets reflect the collection/search scope before filters. */
    async queryProducts(query: ProductQuery, context: PricingContext): Promise<ProductPage> {
      if (selectPage) {
        const { products, ...page } = await selectPage(query, context)
        return { ...page, items: await enrich(products, context) }
      }
      const all = await enrich(await catalog.listProducts(context.storeId), context)
      const collection = query.collection ? (await collections(context.storeId)).find((item) => item.slug === query.collection) : undefined
      const exclude = new Set(query.excludeIds ?? [])
      let scoped = all.filter((product) => !exclude.has(product.id))
      if (collection) scoped = scoped.filter((product) => inCollection(product, collection))
      if (query.kind) scoped = scoped.filter((product) => product.kind === query.kind)
      const scores = new Map<string, number>()
      if (query.q) {
        const groups = await synonyms(context.storeId)
        for (const product of scoped) scores.set(product.id, score(searchable(product), query.q, groups))
        scoped = scoped.filter((product) => (scores.get(product.id) ?? 0) > 0)
      }
      const facets = computeFacets(scoped)

      let items = scoped
      if (query.gender?.length) items = items.filter((product) => query.gender!.includes(product.gender) || product.gender === "unisex")
      if (query.sizes?.length) items = items.filter((product) => product.variants.some((variant, index) => query.sizes!.includes(variant.size.eu) && product.stock[index].available > 0))
      if (query.brands?.length) items = items.filter((product) => query.brands!.includes(product.brand.slug))
      if (query.condition?.length) items = items.filter((product) => product.condition !== null && query.condition!.includes(product.condition))
      if (query.priceMin !== undefined) items = items.filter((product) => product.price.amount >= query.priceMin!)
      if (query.priceMax !== undefined) items = items.filter((product) => product.price.amount <= query.priceMax!)

      const sort = query.sort ?? (query.q ? "featured" : "featured")
      items = [...items].sort((a, b) => {
        if (query.q && sort === "featured") return (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || a.position - b.position
        switch (sort) {
          case "title-asc":
            return a.title.localeCompare(b.title, "en", { sensitivity: "base" }) || a.position - b.position
          case "title-desc":
            return b.title.localeCompare(a.title, "en", { sensitivity: "base" }) || a.position - b.position
          case "newest":
            return Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
          case "oldest":
            return Date.parse(a.publishedAt) - Date.parse(b.publishedAt)
          // Biggest markdown first; full-price pairs follow in featured order.
          case "discount-desc":
            return (b.price.discountPercent ?? 0) - (a.price.discountPercent ?? 0) || a.position - b.position
          case "price-asc":
            return a.price.amount - b.price.amount || a.position - b.position
          case "price-desc":
            return b.price.amount - a.price.amount || a.position - b.position
          default:
            return Number(b.inStock) - Number(a.inStock) || a.position - b.position
        }
      })

      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE
      const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
      const page = Math.min(Math.max(1, query.page ?? 1), pageCount)
      return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageCount, facets }
    },

    async getProduct(slug: string, context: PricingContext): Promise<ProductView | null> {
      const product = await catalog.getProductBySlug(context.storeId, slug)
      if (!product) return null
      return (await enrich([product], context))[0]
    },

    /**
     * "You may also like": same kind, in stock first, then pairs sharing a collection with this one,
     * then the merchant's order (as the design's row follows the New Arrival order); never the product itself.
     */
    async related(product: ProductView, context: PricingContext, limit = 4): Promise<ProductView[]> {
      if (selectRelated) return enrich(await selectRelated(product, context, limit), context)
      const all = await enrich(await catalog.listProducts(context.storeId), context)
      const candidates = all.filter((item) => item.id !== product.id && item.kind === product.kind)
      const shares = (item: ProductView) => Number(item.collections.some((slug) => product.collections.includes(slug)))
      return candidates
        .sort((a, b) => Number(b.inStock) - Number(a.inStock) || shares(b) - shares(a) || a.position - b.position)
        .slice(0, limit)
    },

    /** Every word shoppers could mean: brand names, product titles and collection titles (for "did you mean"). */
    async vocabulary(storeId: string): Promise<string[]> {
      if (indexedVocabulary) return indexedVocabulary(storeId)
      const [products, brands, groups] = await Promise.all([catalog.listProducts(storeId), catalog.listBrands(storeId), collections(storeId)])
      return [...new Set([...products.flatMap((product) => terms(`${product.brand.name} ${product.title}`)), ...brands.flatMap((brand) => terms(brand.name)), ...groups.flatMap((group) => terms(group.title))])]
    },

    enrich,
    allProducts: (storeId: string) => catalog.listProducts(storeId),
    getProductsByVariantIds: (variantIds: string[]) => catalog.getProductsByVariantIds(variantIds),
    upsertProducts: (storeId: string, products: Product[]) => catalog.upsertProducts(storeId, products),
  }
}

export type CatalogService = ReturnType<typeof createCatalogService>
