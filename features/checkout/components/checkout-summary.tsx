import Image from "next/image"
import type { ReactNode } from "react"

import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Cart } from "@/server/cart/types"

const row = "flex items-baseline justify-between gap-4 text-18 font-medium md:text-20"

/**
 * The checkout's order summary: the bag in brief, the promotion-code form and the server's totals
 * for the chosen address and delivery option. Styled as the bag's summary card (design 10).
 */
export function CheckoutSummary({ cart, codeForm, children }: { cart: Cart; codeForm: ReactNode; children: ReactNode }) {
  const price = (amount: number) => formatPrice(amount, cart.currency, { symbol: true })
  const { totals } = cart

  return (
    <section aria-labelledby="checkout-summary-title" className="flex flex-col rounded-2xl bg-background px-5 pt-6 pb-8 shadow-summary-lift outline-1 outline-foreground md:px-7.5 md:pt-7.25 lg:sticky lg:top-27.5">
      <h2 id="checkout-summary-title" className="text-28 font-bold md:text-34">
        Order Summary
      </h2>
      <ul className="flex flex-col gap-4 pt-6">
        {cart.lines.map((line) => (
          <li key={line.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-4">
            <span className="relative size-18 overflow-hidden rounded-lg bg-well">
              <Image src={line.image.url} alt="" fill sizes="72px" className="object-cover" />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-16 font-semibold md:text-18">{line.title}</span>
              <span className="text-14 font-medium text-subtle-foreground md:text-16">
                EUR {line.size.eu} · Qty {line.quantity}
              </span>
              {!line.available ? <span className="text-14 font-semibold text-destructive">Sold out</span> : null}
            </span>
            <span className="text-16 font-bold md:text-18">{price(line.lineTotal)}</span>
          </li>
        ))}
      </ul>

      <div className="pt-6">{codeForm}</div>

      <dl className="flex flex-col gap-4 pt-6">
        <div className={row}>
          <dt className="text-subtle-foreground">
            Subtotal ({cart.itemCount} {cart.itemCount === 1 ? "item" : "items"})
          </dt>
          <dd>{price(totals.subtotal)}</dd>
        </div>
        {cart.promotions.map((promotion) =>
          promotion.amount > 0 ? (
            <div key={promotion.code ?? promotion.title} className={row}>
              <dt className="text-subtle-foreground">{promotion.code ? `Code ${promotion.code}` : promotion.title}</dt>
              <dd className="text-success">−{price(promotion.amount)}</dd>
            </div>
          ) : null,
        )}
        <div className={row}>
          <dt className="text-subtle-foreground">Delivery</dt>
          <dd>{totals.shipping === null ? "Enter your address" : totals.shipping === 0 ? "Free" : price(totals.shipping)}</dd>
        </div>
        {!totals.taxIncluded && totals.tax > 0 ? (
          <div className={row}>
            <dt className="text-subtle-foreground">GST</dt>
            <dd>{price(totals.tax)}</dd>
          </div>
        ) : null}
        <div className={cn("flex items-baseline justify-between gap-4 border-t border-border pt-6 text-24 font-bold md:text-30")}>
          <dt>Total</dt>
          <dd>{price(totals.total)}</dd>
        </div>
        {totals.taxIncluded && totals.tax > 0 ? (
          <div className="flex justify-end text-14 font-medium text-subtle-foreground md:text-16">
            <dt className="sr-only">Tax</dt>
            <dd>Includes {price(totals.tax)} GST</dd>
          </div>
        ) : null}
      </dl>

      {children}
    </section>
  )
}
