"use client"

import Link from "next/link"
import { useId, useState } from "react"

import { ApiError } from "@/api/http"
import { buttonVariants } from "@/components/ui/button-variants"
import { ConditionDialog } from "@/features/catalog/components/condition-dialog"
import { QuantityStepper } from "@/features/catalog/components/quantity-stepper"
import { SizePicker } from "@/features/catalog/components/size-picker"
import type { CardProduct } from "@/features/catalog/types/card"
import { useAddToCart } from "@/hooks/api/cart/useCartMutations"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"

const MAX_PER_ORDER = 10

/** Brand New is lime and Pre-Loved is white, so the two drops never read as the same pair (D-048). */
export const KIND_BADGE = {
  new: { label: "Brand New", className: "bg-brand text-brand-foreground" },
  preloved: { label: "Pre-Loved", className: "bg-background text-foreground" },
} as const

/**
 * One Featured Drop slide's buy box on the black band: size, quantity and add-to-bag. A pre-loved
 * pair is one of a kind, so its only size comes preselected, quantity stays at one, and the
 * condition grade sits under the price.
 */
export function FeaturedBuyBox({
  product,
  stock,
}: {
  product: CardProduct
  stock: Record<string, number>
}) {
  const id = useId()
  const preloved = product.kind === "preloved"
  const onlySize =
    preloved && product.sizes.length === 1 && product.sizes[0].available
      ? product.sizes[0].variantId
      : null
  const [variantId, setVariantId] = useState<string | null>(onlySize)
  /** A pre-loved pair's one size, shown as its tag reads (EUR / UK / US). */
  const tagSize = preloved ? (product.sizes[0] ?? null) : null
  const [quantity, setQuantity] = useState(1)
  const [status, setStatus] = useState<{
    tone: "error" | "ok"
    text: string
  } | null>(null)
  const add = useAddToCart()
  const max = Math.max(
    1,
    Math.min(MAX_PER_ORDER, variantId ? (stock[variantId] ?? 1) : MAX_PER_ORDER)
  )

  function onAdd() {
    if (!variantId) {
      setStatus({ tone: "error", text: "Choose your size to add this pair." })
      return
    }
    add.mutate(
      { variantId, quantity },
      {
        onSuccess: () =>
          setStatus({
            tone: "ok",
            text: `Added ${quantity} × ${product.title} to your bag.`,
          }),
        onError: (error) =>
          setStatus({
            tone: "error",
            text:
              error instanceof ApiError
                ? error.message
                : "Couldn't add this pair. Try again.",
          }),
      }
    )
  }

  return (
    <div className="flex w-full max-w-150 flex-col gap-9.5">
      <div className="flex flex-col gap-7.75">
        <div className="flex flex-col gap-3.5">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-18 font-medium text-brand md:text-24">
              FEATURED DROP
            </span>
            <span
              className={cn(
                "rounded-full px-4 py-1.5 text-14 font-bold tracking-wide-2 uppercase md:text-16",
                KIND_BADGE[product.kind].className
              )}
            >
              {KIND_BADGE[product.kind].label}
            </span>
          </p>
          <h2 className="text-34 font-bold md:text-48 3xl:text-56">
            {product.title}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
          <p className="flex flex-wrap items-baseline gap-x-4 uppercase">
            <span className="text-34 font-semibold text-brand md:text-48">
              {formatPrice(product.price.amount, product.price.currency)}
            </span>
            {product.price.compareAt ? (
              <s className="text-20 font-medium text-muted-foreground md:text-26">
                <span className="sr-only">Was </span>
                {formatPrice(product.price.compareAt, product.price.currency)}
              </s>
            ) : null}
          </p>
        </div>
      </div>

      {preloved ? (
        // One-off pair (D-062): its tag size and grade as facts, laid out like the product page; nothing to choose.
        <div className="flex flex-col gap-7">
          {tagSize ? (
            <div className="flex flex-col items-start gap-3.5">
              <p className="text-20 font-semibold md:text-26">Size</p>
              <p className="flex h-14 items-center rounded-lg bg-background ps-5 pe-4.75 text-22 font-semibold text-foreground md:h-18 md:text-30">
                <span className="sr-only">Tag size: </span>EUR {tagSize.eu} - UK{" "}
                {tagSize.uk} - US {tagSize.us}
              </p>
            </div>
          ) : null}
          {product.condition ? (
            <div className="flex flex-col items-start gap-3.5">
              <p className="text-20 font-semibold md:text-26">Condition</p>
              <ConditionDialog grade={product.condition} onDark />
            </div>
          ) : null}
        </div>
      ) : (
        <SizePicker
          legend="Select size (EUR)"
          legendClassName="text-20 font-semibold uppercase md:text-24"
          variant="featured"
          options={product.sizes.map((size) => ({
            variantId: size.variantId,
            label: size.eu,
            available: size.available,
          }))}
          value={variantId}
          onChange={(next) => {
            setVariantId(next)
            setQuantity(1)
            setStatus(null)
          }}
          invalid={status?.tone === "error" && !variantId}
          describedBy={`${id}-status`}
        />
      )}

      {preloved ? null : (
        <div className="flex flex-wrap items-end justify-between gap-6 ps-1.25 pt-2.5">
          <div className="flex flex-col gap-3.5">
            <p
              id={`${id}-qty`}
              className="text-20 font-medium uppercase md:text-26"
            >
              Quantity
            </p>
            <QuantityStepper
              tone="dark"
              value={quantity}
              max={max}
              onChange={setQuantity}
            />
          </div>
          <Link
            href="/size-guide"
            className="-mb-1.5 text-20 font-bold uppercase underline underline-offset-4 hover:text-brand md:text-26"
          >
            Size guide
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-5.75 pt-0.75">
        <button
          type="button"
          onClick={onAdd}
          disabled={!product.inStock || add.isPending}
          className={cn(
            buttonVariants({ tone: "brand-on-ink", size: "lg" }),
            "w-full"
          )}
        >
          {!product.inStock
            ? "Sold out"
            : add.isPending
              ? "Adding…"
              : "Add to cart"}
        </button>
        <Link
          href={`/products/${product.slug}`}
          className={cn(
            buttonVariants({ tone: "outline-dark", size: "lg" }),
            "w-full"
          )}
        >
          View details<span className="sr-only">: {product.title}</span>
        </Link>
        <p
          id={`${id}-status`}
          role="status"
          aria-live="polite"
          className={cn(
            "text-16 font-semibold empty:hidden",
            status?.tone === "ok" ? "text-brand" : "text-background"
          )}
        >
          {status ? (
            <>
              {status.text}{" "}
              {status.tone === "ok" ? (
                <Link href="/cart" className="underline underline-offset-4">
                  View bag
                </Link>
              ) : null}
            </>
          ) : null}
        </p>
      </div>
    </div>
  )
}
