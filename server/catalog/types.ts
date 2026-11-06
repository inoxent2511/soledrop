import type { CurrencyCode } from "@/server/shared/money"

export type ProductKind = "new" | "preloved"
export type Gender = "men" | "women" | "kids" | "unisex"
export type ProductStatus = "draft" | "active" | "archived"

/** Pre-loved condition grades, best first — the five cards of the Condition Guide on the Pre-Loved screen (D-015). */
export const CONDITION_GRADES = ["like-new", "premium", "excellent", "very-good", "minor-issue"] as const
export type ConditionGrade = (typeof CONDITION_GRADES)[number]

/** Values a product or variant attribute can hold (attribute system; definitions in AttributeDefinition). */
export type AttributeValue = string | number | boolean | string[]

export type AttributeDefinition = {
  code: string
  label: string
  type: "text" | "number" | "boolean" | "enum" | "multi_enum"
  scope: "product" | "variant"
  options?: { value: string; label: string }[]
  filterable: boolean
  position: number
}

/** Merchant-defined fields on products, orders and customers, validated by `server/custom-fields`. */
export type CustomFieldDefinition = {
  entity: "product" | "order" | "customer"
  code: string
  label: string
  type: "text" | "number" | "boolean" | "date" | "url"
  required: boolean
  visibleOnStorefront: boolean
}

export type Brand = { id: string; slug: string; name: string; position: number }

/**
 * `card` is the cut-out photo listing cards show; `gallery` photos fill the product page. A product
 * with no gallery photos shows its card photo on the product page instead.
 */
export type ProductImage = { url: string; alt: string; width: number; height: number; role?: "card" | "gallery" }

/** The photos the product page shows: the gallery, or the card photo when there is no gallery. */
export function galleryImages(images: ProductImage[]): ProductImage[] {
  const gallery = images.filter((image) => image.role !== "card")
  return gallery.length ? gallery : images
}

/** The photo listing cards show: the one marked `card`, else the first. */
export function cardImage(images: ProductImage[]): ProductImage | null {
  return images.find((image) => image.role === "card") ?? images[0] ?? null
}

export type SizeChart = { eu: string; uk: string; us: string; cm: string }

export type Variant = {
  id: string
  sku: string
  size: SizeChart
  attributes: Record<string, AttributeValue>
  weightGrams: number
  position: number
}

export type Product = {
  id: string
  storeId: string
  slug: string
  title: string
  brand: Brand
  kind: ProductKind
  gender: Gender
  status: ProductStatus
  description: string
  condition: ConditionGrade | null
  conditionNotes: string | null
  images: ProductImage[]
  variants: Variant[]
  attributes: Record<string, AttributeValue>
  customFields: Record<string, AttributeValue>
  collections: string[]
  tags: string[]
  position: number
  publishedAt: string
  seo: { title?: string; description?: string }
}

export type Collection = {
  id: string
  storeId: string
  slug: string
  title: string
  headline: [string, string]
  description: string
  kind: "manual" | "rule"
  /** For rule collections: every condition must match (rules engine, server/rules). */
  rules: CollectionRule[]
  image: ProductImage | null
  position: number
  seo: { title?: string; description?: string }
}

export type CollectionRule =
  | { field: "kind"; equals: ProductKind }
  | { field: "gender"; in: Gender[] }
  | { field: "tag"; equals: string }
  | { field: "onSale"; equals: boolean }
  | { field: "publishedWithinDays"; days: number }

/** A variant's resolved price for a shopper (price lists applied), in minor units. */
export type VariantPrice = { variantId: string; amount: number; compareAt: number | null; currency: CurrencyCode }

export type StockLevel = { variantId: string; available: number }

/** What listing cards and the PDP need: product + resolved prices + availability. */
export type ProductView = Product & {
  prices: VariantPrice[]
  stock: StockLevel[]
  price: { amount: number; compareAt: number | null; currency: CurrencyCode; discountPercent: number | null }
  inStock: boolean
}

export type SortKey = "featured" | "title-asc" | "title-desc" | "newest" | "oldest" | "price-asc" | "price-desc" | "discount-desc"

export type ProductQuery = {
  collection?: string
  kind?: ProductKind
  gender?: Gender[]
  sizes?: string[]
  brands?: string[]
  priceMin?: number
  priceMax?: number
  condition?: ConditionGrade[]
  q?: string
  sort?: SortKey
  page?: number
  pageSize?: number
  excludeIds?: string[]
}

export type Facets = {
  genders: { value: Gender; count: number }[]
  sizes: { value: string; count: number }[]
  brands: { value: string; label: string; count: number }[]
  price: { min: number; max: number }
  conditions: { value: ConditionGrade; count: number }[]
}

export type ProductPage = { items: ProductView[]; total: number; page: number; pageCount: number; facets: Facets }
