import Link from "next/link"

import { buttonVariants } from "@/components/ui/button-variants"
import { ProductCard } from "@/features/catalog/components/product-card"
import type { ListingView } from "@/features/catalog/components/listing-toolbar"
import { listingHref, type ListingState } from "@/features/catalog/lib/listing-url"
import type { CardProduct } from "@/features/catalog/types/card"
import { cn } from "@/lib/utils"

type ProductResultsProps = {
  pathname: string
  state: ListingState
  view: ListingView
  products: CardProduct[]
  total: number
  page: number
  pageCount: number
  filtered: boolean
}

/** The listing's product grid (3 × 400 px columns at 1920), its list view, empty state and pages. */
export function ProductResults({ pathname, state, view, products, total, page, pageCount, filtered }: ProductResultsProps) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-start gap-6 rounded-xl border-2 border-border bg-background p-8 md:p-12">
        <p role="status" className="text-28 font-extrabold uppercase md:text-40">
          No pairs found
        </p>
        <p className="max-w-130 text-18 text-subtle-foreground">
          {filtered ? "Nothing matches every filter you picked. Remove one or clear them all to see more pairs." : "This collection is empty right now — new drops land every week."}
        </p>
        <Link
          href={filtered ? listingHref(pathname, state, { gender: null, size: null, brand: null, min: null, max: null, condition: null }) : "/new-arrivals"}
          className={cn(buttonVariants({ tone: "ink-light", size: "md" }), "rounded-md")}
        >
          {filtered ? "Clear filters" : "See new arrivals"}
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      <p role="status" className="sr-only">
        {total === 1 ? "1 pair" : `${total} pairs`}
        {pageCount > 1 ? `, page ${page} of ${pageCount}` : ""}
      </p>
      <ul className={cn("grid gap-4 md:gap-6 3xl:gap-8.5", view === "grid" ? "grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3" : "grid-cols-1")}>
        {products.map((product, index) => (
          <li key={product.id}>
            <ProductCard product={product} priority={index < 3} layout={view === "list" ? "row" : "grid"} headingLevel="h2" />
          </li>
        ))}
      </ul>
      {pageCount > 1 ? <Pagination pathname={pathname} state={state} page={page} pageCount={pageCount} /> : null}
    </div>
  )
}

function Pagination({ pathname, state, page, pageCount }: { pathname: string; state: ListingState; page: number; pageCount: number }) {
  const href = (target: number) => listingHref(pathname, state, { page: target === 1 ? null : String(target) })
  const cell = "flex h-12 min-w-12 items-center justify-center rounded-md border-2 px-3 text-18 font-bold transition-colors"
  return (
    <nav aria-label="Pages" className="flex justify-center">
      <ul className="flex flex-wrap items-center gap-2">
        <li>
          {page > 1 ? (
            <Link href={href(page - 1)} rel="prev" className={cn(cell, "border-border bg-background hover:border-foreground")}>
              Previous
            </Link>
          ) : null}
        </li>
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((target) => (
          <li key={target}>
            <Link
              href={href(target)}
              aria-label={`Page ${target}`}
              aria-current={target === page ? "page" : undefined}
              className={cn(cell, target === page ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground")}
            >
              {target}
            </Link>
          </li>
        ))}
        <li>
          {page < pageCount ? (
            <Link href={href(page + 1)} rel="next" className={cn(cell, "border-border bg-background hover:border-foreground")}>
              Next
            </Link>
          ) : null}
        </li>
      </ul>
    </nav>
  )
}
