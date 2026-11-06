"use client"

import Image from "next/image"
import Link from "next/link"

import { TrashIcon } from "@/components/icons"
import { CartQuantity } from "@/features/cart/components/cart-quantity"
import { conditionLabel, formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Cart, CartLine } from "@/server/cart/types"

type CartLineItemProps = {
  line: CartLine
  currency: Cart["currency"]
  busy: boolean
  onQuantity: (quantity: number) => void
  onRemove: () => void
}

const detail = "text-18 font-medium text-subtle-foreground md:text-22"

/**
 * One bag line (design 10, Frame 200): photo, kind badge, name, size and colour or condition,
 * Remove; then the unit price (struck compare-at price when on sale) with the quantity pill for
 * new pairs, and the line total. Pre-loved pairs are one of a kind, so they have no stepper.
 */
export function CartLineItem({ line, currency, busy, onQuantity, onRemove }: CartLineItemProps) {
  const price = (amount: number) => formatPrice(amount, currency, { symbol: true })
  const preLoved = line.kind === "preloved"

  return (
    <li className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 gap-y-5 rounded-xl bg-background p-4 outline-1 outline-border-strong md:grid-cols-[13.75rem_minmax(0,1fr)] md:gap-x-7.5 md:p-5 3xl:flex 3xl:h-65 3xl:items-center 3xl:gap-0">
      <Link href={`/products/${line.slug}`} tabIndex={-1} aria-hidden="true" className="relative aspect-square w-full shrink-0 overflow-hidden rounded-xl bg-well 3xl:size-55">
        <Image src={line.image.url} alt="" fill sizes="(min-width: 768px) 220px, 96px" className="object-cover" />
      </Link>

      <div className="flex min-w-0 flex-col items-start 3xl:h-full 3xl:w-114.25 3xl:shrink-0 3xl:ps-7.5">
        <span
          className={cn(
            "flex h-9 items-center justify-center rounded-sm px-3 text-16 font-semibold md:h-12 md:w-37 md:px-0 md:text-20",
            preLoved ? "bg-foreground text-background" : "bg-brand text-brand-foreground",
          )}
        >
          {preLoved ? "Pre-Loved" : "Brand New"}
        </span>
        <h2 className="pt-3 text-20 font-semibold md:text-26">
          <Link href={`/products/${line.slug}`} className="hover:underline">
            {line.title}
          </Link>
        </h2>
        <p className={cn(detail, "pt-2 md:pt-3")}>Size: EUR {line.size.eu}</p>
        {preLoved && line.condition ? (
          <p className={cn(detail, "pt-2 md:pt-3")}>Condition: {conditionLabel(line.condition)}</p>
        ) : line.colour ? (
          <p className={cn(detail, "pt-2 md:pt-3")}>Color: {line.colour}</p>
        ) : null}
        {!line.available ? (
          <p className="pt-2 text-16 font-semibold text-destructive md:text-18">Sold out — remove it to check out</p>
        ) : null}
        <div className="pt-4 md:pt-6.25">
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            data-cart-focus
            aria-label={`Remove ${line.title}, size EUR ${line.size.eu}`}
            className="flex items-start gap-2.5 text-destructive transition-opacity hover:underline disabled:opacity-50"
          >
            <TrashIcon className="h-6 w-5" />
            <span className="pt-0.5 text-18 md:text-20">Remove</span>
          </button>
        </div>
      </div>

      <div className="col-span-2 flex flex-wrap items-center justify-between gap-4 3xl:col-span-1 3xl:h-full 3xl:flex-1 3xl:flex-nowrap 3xl:gap-0">
        <div className="flex flex-col items-center gap-4 3xl:gap-10">
          <p className="flex gap-2 text-18 font-medium whitespace-nowrap md:text-24">
            {line.compareAt ? (
              <>
                <s className="text-subtle-foreground">
                  <span className="sr-only">Was </span>
                  {price(line.compareAt)}
                </s>
                <span className="text-success">
                  <span className="sr-only">now </span>
                  {price(line.unitPrice)}
                </span>
              </>
            ) : (
              <span className="text-subtle-foreground">{price(line.unitPrice)}</span>
            )}
            {line.quantity > 1 ? <span className="sr-only"> each</span> : null}
          </p>
          {preLoved ? null : (
            <CartQuantity
              value={line.quantity}
              max={Math.max(line.maxQuantity, line.quantity)}
              onChange={onQuantity}
              disabled={busy || !line.available}
              label={`Quantity of ${line.title}`}
            />
          )}
        </div>
        <p className="text-24 font-bold md:text-34 3xl:pe-5">
          <span className="sr-only">Line total: </span>
          {price(line.lineTotal)}
        </p>
      </div>
    </li>
  )
}
