import type { CurrencyCode } from "@/server/shared/money"

/** The trimmed product the search overlay shows (no variants, stock levels or descriptions). */
export type SuggestProduct = {
  slug: string
  title: string
  brand: string
  kind: "new" | "preloved"
  /** Condition label such as "Premium" or "Excellent" for pre-loved pairs. */
  condition: string | null
  image: { url: string; alt: string } | null
  price: { amount: number; compareAt: number | null; currency: CurrencyCode }
  inStock: boolean
}

export type SuggestLink = { label: string; href: string }

/** GET /api/search/suggest: the landing panel (empty `query`) or the results for a typed query. */
export type SuggestResponse = {
  query: string
  /** Every product matching the query (the "View all N results" count). */
  total: number
  /** Query completions with the typed words highlighted on the client. */
  suggestions: string[]
  collections: SuggestLink[]
  brands: SuggestLink[]
  products: SuggestProduct[]
  /** A corrected query when nothing matched and a catalogue word is close. */
  didYouMean: string | null
  /** Landing and no-results panels: what shoppers search for most. */
  trending: string[]
  /** No-results panel: popular pairs to keep browsing. */
  popular: SuggestProduct[]
}

/** A product page the shopper opened, kept on this device for "Recently viewed". */
export type ViewedProduct = Pick<SuggestProduct, "slug" | "title" | "brand" | "image" | "price">
