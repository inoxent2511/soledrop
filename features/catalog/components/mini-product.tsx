import Image from "next/image"
import Link from "next/link"

import type { SuggestProduct } from "@/features/search/types"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"

type MiniProductProps = {
  product: Pick<SuggestProduct, "slug" | "title" | "brand" | "image" | "price"> & Partial<Pick<SuggestProduct, "inStock" | "condition">>
  badge?: string | null
  /** Image `sizes` for the slot the tile sits in. */
  sizes: string
  onSelect?: () => void
  className?: string
  /** Extra props for the link (ids and roles when the tile is a combobox option). */
  linkProps?: Record<string, string | number | boolean | undefined>
}

/**
 * The compact product tile in header panels (mega-menu picks, search results, recently viewed):
 * square photo, brand, two-line name, price with the compare-at price struck, sold-out note.
 */
export function MiniProduct({ product, badge, sizes, onSelect, className, linkProps }: MiniProductProps) {
  const price = (amount: number) => formatPrice(amount, product.price.currency, { symbol: true })
  return (
    <Link href={`/products/${product.slug}`} onClick={onSelect} className={cn("group flex min-w-0 flex-col gap-2", className)} {...linkProps}>
      <span className="relative block aspect-square overflow-hidden rounded-xl bg-well">
        {product.image ? (
          <Image src={product.image.url} alt="" fill sizes={sizes} className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-105" />
        ) : null}
        {badge ? (
          <span className="absolute start-2 top-2 rounded-xs bg-brand px-1.5 py-0.5 text-14 font-bold text-brand-foreground">{badge}</span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-14 font-bold tracking-wide-2 text-faint-foreground uppercase">{product.brand}</span>
        <span className="line-clamp-2 text-16 font-bold group-hover:underline">{product.title}</span>
        <span className="flex flex-wrap items-baseline gap-x-2 text-16">
          <span className={cn("font-bold", product.price.compareAt && "text-success")}>
            {product.price.compareAt ? <span className="sr-only">Now </span> : null}
            {price(product.price.amount)}
          </span>
          {product.price.compareAt ? (
            <s className="text-14 text-subtle-foreground">
              <span className="sr-only">was </span>
              {price(product.price.compareAt)}
            </s>
          ) : null}
        </span>
        {product.condition ? <span className="text-14 text-subtle-foreground">Condition: {product.condition}</span> : null}
        {product.inStock === false ? <span className="text-14 font-semibold text-destructive">Sold out</span> : null}
      </span>
    </Link>
  )
}
