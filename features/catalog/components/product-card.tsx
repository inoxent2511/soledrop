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
  compact?: boolean
}

/**
 * Product card for Home, listings and "You may also like". New pairs offer size
 * chips and ADD TO CART; pre-loved pairs (one of a kind) show the tag size and condition and
 * link to the details page instead. `row` is the listing's list view: image beside the details.
 */
export function ProductCard({
  product,
  priority = false,
  headingLevel: Heading = "h3",
  layout = "grid",
  compact = false,
}: ProductCardProps) {
  const href = `/products/${product.slug}`
  const preloved = product.kind === "preloved"
  const tagSize = product.sizes[0]?.eu
  const row = layout === "row"

  return (
    <article
      className={cn(
        "flex h-full min-w-0 flex-col rounded-xl bg-background p-3 outline-1 outline-border md:p-3.5",
        compact && "max-sm:rounded-lg max-sm:p-2.5",
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
            sizes={compact ? "(min-width: 1920px) 364px, (min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 360px) 45vw, 80vw" : "(min-width: 1920px) 364px, (min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 80vw"}
            className="object-cover transition-transform duration-300 hover:scale-105"
          />
        ) : null}
        {product.price.discountPercent ? (
          <span className={cn("absolute end-3 top-3 flex h-7 items-center justify-center rounded-xs bg-foreground px-2 text-14 leading-none font-bold tracking-tight-1 text-brand md:end-5 md:top-5 md:text-16", compact && "max-sm:end-1.5 max-sm:top-1.5 max-sm:h-6 max-sm:px-1.5 max-sm:text-xs")}>
            {product.price.discountPercent}% OFF
          </span>
        ) : null}
        {product.inStock ? null : (
          <span className="absolute start-2 top-2 flex h-6 items-center rounded-xs bg-background px-2 text-xs font-bold uppercase md:start-5 md:top-5 md:h-7 md:text-14">
            Sold out
          </span>
        )}
      </Link>

      <div
        className={cn(
          "flex flex-1 flex-col gap-2.5 pt-3 md:gap-3 md:pt-3.5",
          compact && "max-sm:gap-2 max-sm:pt-2.5",
          row && "sm:max-w-120 sm:justify-center sm:pt-0"
        )}
      >
        <div className={cn("flex flex-col gap-2 md:gap-2.5", compact && "max-sm:gap-1.5")}>
          <Heading className={cn("flex min-h-6 items-center text-17 leading-tight font-semibold tracking-tight-1 md:text-18", compact && "max-sm:min-h-9 max-sm:items-start max-sm:text-14 max-sm:leading-4.5")}>
            <Link href={href} className={cn("line-clamp-2 hover:underline", compact && "max-sm:line-clamp-2")}>
              {product.title}
            </Link>
          </Heading>
          {/* The design gives the sale price a 140 px slot, so the was-price lines up across cards; tracking is per span so the em resolves at each size. */}
          <p className={cn("flex min-h-6 flex-wrap items-baseline gap-x-2 gap-y-0.5 uppercase", compact && "max-sm:flex-col max-sm:items-start max-sm:gap-y-0")}>
            <span className="sr-only">
              {product.price.compareAt ? "Sale price" : "Price"}
            </span>
            <span className={cn("text-18 font-bold tracking-tight-1 md:text-20", compact && "max-sm:text-[15px] max-sm:leading-5")}>
              {formatPrice(product.price.amount, product.price.currency)}
            </span>
            {product.price.compareAt ? (
              <>
                <span className="sr-only">, was</span>
                <s className={cn("text-14 font-medium tracking-tight-1 text-faint-foreground md:text-16", compact && "max-sm:text-xs max-sm:leading-4")}>
                  {formatPrice(product.price.compareAt, product.price.currency)}
                </s>
              </>
            ) : null}
          </p>
        </div>

        {preloved ? (
          <>
            <div className={cn("flex min-h-10 flex-wrap items-center gap-2", compact && "max-sm:min-h-0 max-sm:gap-1.5")}>
              {tagSize ? (
                <span className={cn("flex h-9 items-center justify-center rounded-xs bg-foreground px-2 text-16 font-semibold tracking-tight-1 text-background md:h-10 md:text-18", compact && "max-sm:h-7 max-sm:text-xs")}>
                  Euro {tagSize}
                </span>
              ) : null}
              {product.condition ? (
                // A plain label (D-071): the grade's meaning is on the product page, one tap away.
                <span className={cn("flex h-9 items-center gap-1 rounded-sm bg-success px-2 text-success-foreground md:h-10", compact && "max-sm:h-7")}>
                  <span className={cn("text-14 font-medium tracking-tight-1", compact && "max-sm:text-xs")}>
                    Cond:
                  </span>
                  <span className={cn("text-16 font-bold tracking-tight-1", compact && "max-sm:text-xs")}>
                    {conditionLabel(product.condition)}
                  </span>
                </span>
              ) : null}
            </div>
            <Link
              href={href}
              className={cn(
                buttonVariants({ tone: "brand", size: "card" }),
                "mt-auto w-full",
                compact && "max-sm:h-11 max-sm:px-2 max-sm:text-xs"
              )}
            >
              View details<span className="sr-only">: {product.title}</span>
            </Link>
          </>
        ) : (
          <QuickAdd product={product} compact={compact} />
        )}
      </div>
    </article>
  )
}
