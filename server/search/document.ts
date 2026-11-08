import type { Product } from "@/server/catalog/types"
import type { Searchable } from "./match"

/** The fields search reads: brand + title, then attribute values, kind, description and tags; SKUs and EU sizes. */
export function searchable(product: Product): Searchable {
  const attributeText = Object.values(product.attributes).flatMap((value) => (Array.isArray(value) ? value : [value])).map(String)
  return {
    title: `${product.brand.name} ${product.title}`,
    body: [...attributeText, product.kind === "preloved" ? "pre-loved preloved" : "brand new", product.description, ...product.tags].join(" "),
    skus: product.variants.map((variant) => variant.sku),
    sizes: product.variants.map((variant) => variant.size.eu),
  }
}

