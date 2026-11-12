import Image from "next/image"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button-variants"
import { QuickAdd } from "@/features/catalog/components/quick-add"
import type { CardProduct } from "@/features/catalog/types/card"
import { conditionLabel, formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"

type ProductCardProps = {
  product: CardProduct
  priority?: boolean
  headingLevel?: "h2" | "h3"
  layout?: "grid" | "row"
}

/**
 * The 400×600 product card from Home, listings and "You may also like". New pairs offer size
 * chips and ADD TO CART; pre-loved pairs (one of a kind) show the tag size and condition and
 * link to the details page instead. `row` is the listing's list view: image beside the details.
 */
export function ProductCard({
  product,
  priority = false,
  headingLevel: Heading = "h3",
  layout = "grid",
}: ProductCardProps) {
  const href = `/products/${product.slug}`
  const preloved = product.kind === "preloved"
  const tagSize = product.sizes[0]?.eu
  const row = layout === "row"

  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-xl bg-background p-4.5 outline-2 outline-border",
        row && "sm:flex-row sm:gap-8"
      )}
    >
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden="true"
        className={cn(
          "relative block aspect-square overflow-hidden rounded-lg bg-well",
          row && "sm:w-60 sm:shrink-0 lg:w-91"
        )}
      >
        {product.image ? (
          <Image
            src={product.image.url}
            alt=""
            fill
            priority={priority}
            sizes="(min-width: 1920px) 364px, (min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 80vw"
            className="object-cover transition-transform duration-300 hover:scale-105"
          />
        ) : null}
        {product.price.discountPercent ? (
          <span className="absolute end-5 top-5 flex h-7 w-21 items-center justify-center rounded-xs bg-foreground text-16 leading-0 font-bold tracking-tight-1 text-brand">
            {product.price.discountPercent}% OFF
          </span>
        ) : null}
        {product.inStock ? null : (
          <span className="absolute start-5 top-5 flex h-7 items-center rounded-xs bg-background px-2.5 text-14 font-bold uppercase">
            Sold out
          </span>
        )}
      </Link>

      <div
        className={cn(
          "flex flex-1 flex-col gap-3.75 pt-5.5",
          row && "sm:max-w-120 sm:justify-center sm:pt-0"
        )}
      >
        <div className="flex flex-col gap-3">
          <Heading className="flex h-6 items-center text-20 leading-0 font-bold tracking-tight-1">
            <Link href={href} className="truncate leading-6 hover:underline">
              {product.title}
            </Link>
          </Heading>
          {/* The design gives the sale price a 140 px slot, so the was-price lines up across cards; tracking is per span so the em resolves at each size. */}
          <p className="flex h-6 items-center leading-0 uppercase">
            <span className="sr-only">
              {product.price.compareAt ? "Sale price" : "Price"}
            </span>
            <span className="min-w-35 pe-3 text-22 font-bold tracking-tight-1">
              {formatPrice(product.price.amount, product.price.currency)}
            </span>
            {product.price.compareAt ? (
              <>
                <span className="sr-only">, was</span>
                <s className="text-18 font-medium tracking-tight-1 text-faint-foreground">
                  {formatPrice(product.price.compareAt, product.price.currency)}
                </s>
              </>
            ) : null}
          </p>
        </div>

        {preloved ? (
          <>
            <div className="flex min-h-10 flex-wrap items-center gap-3.25">
              {tagSize ? (
                <span className="flex h-10 w-25 items-center justify-center rounded-xs bg-foreground text-18 font-semibold tracking-tight-1 text-background">
                  Euro {tagSize}
                </span>
              ) : null}
              {product.condition ? (
                // A plain label (D-071): the grade's meaning is on the product page, one tap away.
                <span className="flex h-10 min-w-42 items-center gap-1 rounded-sm bg-success ps-2.75 pe-2.5 text-success-foreground">
                  <span className="text-14 font-medium tracking-tight-1">
                    Cond:
                  </span>
                  <span className="text-17 font-bold tracking-tight-1">
                    {conditionLabel(product.condition)}
                  </span>
                </span>
              ) : null}
            </div>
            <Link
              href={href}
              className={cn(
                buttonVariants({ tone: "brand", size: "card" }),
                "w-full"
              )}
            >
              View details<span className="sr-only">: {product.title}</span>
            </Link>
          </>
        ) : (
          <QuickAdd product={product} />
        )}
      </div>
    </article>
  )
}
