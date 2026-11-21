import { ProductCard } from "@/features/catalog/components/product-card"
import type { CardProduct } from "@/features/catalog/types/card"

/** Home products: a swipeable rail, then four or five columns as room allows. */
export function ProductRow({ products, priority = false }: { products: CardProduct[]; priority?: boolean }) {
  return (
    <ul className="home-product-row relative flex snap-x snap-mandatory gap-3 overflow-x-auto p-0.5 pb-2 sm:gap-4">
      {products.map((product, index) => (
        <li key={product.id} className="shrink-0 basis-[82%] snap-start sm:basis-2/5 lg:basis-3/10">
          <ProductCard product={product} priority={priority && index < 2} />
        </li>
      ))}
    </ul>
  )
}
