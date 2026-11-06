import Link from "next/link"

import { saleSavings } from "@/features/cart/lib/free-delivery"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Cart } from "@/server/cart/types"

const row = "flex items-baseline justify-between gap-4 text-20 font-medium md:text-24"
const action = "flex h-14 items-center justify-center rounded-lg text-20 font-semibold transition-colors md:h-16 md:text-24"

/**
 * "Order Summary" (design 10, Frame 201). Every figure is the server's: subtotal, discounts,
 * delivery for the default destination and the total. Checkout is withheld while a line needs
 * attention (sold out or reduced).
 */
export function OrderSummary({ cart, blocked }: { cart: Cart; blocked: boolean }) {
  const price = (amount: number) => formatPrice(amount, cart.currency, { symbol: true })
  const { totals } = cart
  const savings = saleSavings(cart)

  return (
    <section
      aria-labelledby="order-summary-title"
      className="flex flex-col rounded-2xl bg-background px-5 pt-6 pb-8 shadow-summary-lift outline-1 outline-foreground md:px-7.5 md:pt-7.25 3xl:min-h-190"
    >
      <h2 id="order-summary-title" tabIndex={-1} className="text-28 font-bold outline-none md:text-34">
        Order Summary
      </h2>
      <dl className="flex flex-col">
        <div className={cn(row, "pt-8 md:pt-10")}>
          <dt className="text-subtle-foreground">
            Subtotal ({cart.itemCount} {cart.itemCount === 1 ? "item" : "items"})
          </dt>
          <dd>{price(totals.subtotal)}</dd>
        </div>
        {cart.promotions.map((promotion) =>
          promotion.amount > 0 ? (
            <div key={promotion.code ?? promotion.title} className={cn(row, "pt-6 md:pt-7.5")}>
              <dt className="text-subtle-foreground">{promotion.code ? `Code ${promotion.code}` : promotion.title}</dt>
              <dd className="text-success">−{price(promotion.amount)}</dd>
            </div>
          ) : null,
        )}
        <div className={cn(row, "pt-6 pb-8 md:pt-7.5 md:pb-10.25")}>
          <dt className="text-subtle-foreground">Delivery</dt>
          <dd>{totals.shipping === null ? "At checkout" : totals.shipping === 0 ? "Free" : price(totals.shipping)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-border pt-8 text-24 font-bold md:pt-10 md:text-30">
          <dt>Total</dt>
          <dd>{price(totals.total)}</dd>
        </div>
      </dl>
      {savings > 0 ? (
        <div className="pt-6">
          <p className="flex items-center justify-between gap-4 rounded-lg bg-brand-tint px-4 py-3 text-16 font-semibold md:text-18">
            You&apos;re saving on sale prices
            <span className="font-bold text-success">{price(savings)}</span>
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 pt-8 md:pt-11">
        {blocked ? (
          <span aria-disabled="true" className={cn(action, "cursor-not-allowed bg-foreground/40 text-background")}>
            Proceed to Checkout
          </span>
        ) : (
          <Link href="/checkout" className={cn(action, "bg-foreground text-background hover:bg-brand hover:text-brand-foreground")}>
            Proceed to Checkout
          </Link>
        )}
        <Link href="/" className={cn(action, "bg-brand text-brand-foreground hover:bg-foreground hover:text-brand")}>
          Continue Shopping
        </Link>
      </div>

      {/* Free-delivery progress has its own bar above the bag (D-059), so this line is about tax and payment only. */}
      <p className="pt-6 text-16 font-medium text-subtle-foreground md:pt-8 md:text-18">
        {totals.taxIncluded ? "Prices include GST. Cash on delivery and bank transfer at checkout." : "GST is added at checkout."}
      </p>
    </section>
  )
}
