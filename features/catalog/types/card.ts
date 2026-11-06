import {
  cardImage,
  type ConditionGrade,
  type ProductKind,
  type ProductView,
} from "@/server/catalog/types"
import type { CurrencyCode } from "@/server/shared/money"

/** What a product card needs — a slim, serialisable slice of ProductView for client components. */
export type CardProduct = {
  id: string
  slug: string
  title: string
  kind: ProductKind
  image: { url: string; alt: string } | null
  price: {
    amount: number
    compareAt: number | null
    currency: CurrencyCode
    discountPercent: number | null
  }
  condition: ConditionGrade | null
  inStock: boolean
  /** UK and US are the size on the pair's tag (pre-loved) or the catalogue conversion (new). */
  sizes: {
    variantId: string
    eu: string
    uk: string
    us: string
    available: boolean
  }[]
}

export function toCardProduct(product: ProductView): CardProduct {
  const image = cardImage(product.images)
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    kind: product.kind,
    image: image ? { url: image.url, alt: image.alt } : null,
    price: product.price,
    condition: product.condition,
    inStock: product.inStock,
    sizes: product.variants.map((variant, index) => ({
      variantId: variant.id,
      eu: variant.size.eu,
      uk: variant.size.uk,
      us: variant.size.us,
      available: (product.stock[index]?.available ?? 0) > 0,
    })),
  }
}
