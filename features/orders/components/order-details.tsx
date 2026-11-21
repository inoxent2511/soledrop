import Image from "next/image"
import Link from "next/link"

import { Container } from "@/components/shared/container"
import { OrderActions } from "@/features/orders/components/order-actions"
import { conditionLabel, formatDate, formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { PaymentNextStep } from "@/server/adapters/payments/types"
import type { OrderDto } from "@/server/http/dto"
import type { OrderStatus } from "@/server/orders/types"

const PAYMENT_LABEL: Record<string, string> = { cod: "Cash on delivery", bank_transfer: "Bank transfer", stripe: "Card" }
const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "confirmed", label: "Confirmed" },
  { status: "processing", label: "Being packed" },
  { status: "shipped", label: "Shipped" },
  { status: "delivered", label: "Delivered" },
]
const RETURN_LABEL = { requested: "Return requested", approved: "Return approved", received: "Return received", rejected: "Return declined" } as const

const card = "flex flex-col gap-5 rounded-xl bg-background p-5 outline-1 outline-border-strong md:p-7.5"
const heading = "text-24 font-bold md:text-28"
const row = "flex items-baseline justify-between gap-4 text-18 font-medium md:text-20"

type Props = { order: OrderDto; next: PaymentNextStep; token: string | null; justPlaced: boolean }

/**
 * Order confirmation and status (derived from the bag's cards and summary). Shows what to do
 * next (bank-transfer details), where the order is, what was bought and what it cost, and the
 * shopper's own actions: cancel before packing, request a return within 7 days of delivery.
 */
export function OrderDetails({ order, next, token, justPlaced }: Props) {
  const price = (amount: number) => formatPrice(amount, order.currency, { symbol: true })
  const reached = order.history.map((entry) => entry.to)
  const ended = order.status === "cancelled" || order.status === "returned"
  const firstName = order.shippingAddress.fullName.split(" ")[0]

  return (
    <div className="bg-surface">
      <Container className="flex flex-col gap-8 pt-8 pb-16 md:pt-14 md:pb-24">
        <header className="flex flex-col gap-3">
          {justPlaced ? (
            <>
              <p className="w-fit rounded-sm bg-brand px-3 py-1.5 text-16 font-semibold text-brand-foreground md:text-18">Order placed</p>
              <h1 className="text-34 font-bold tracking-tight-2 md:text-54">Thank you, {firstName}.</h1>
              <p className="max-w-200 text-18 text-subtle-foreground md:text-20">
                Your order <strong className="font-semibold text-foreground">{order.number}</strong> is in. We&rsquo;ve emailed a confirmation to {order.email}; keep it to check on your order any time.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-34 font-bold tracking-tight-2 md:text-54">Order {order.number}</h1>
              <p className="text-18 text-subtle-foreground md:text-20">
                Placed {formatDate(order.placedAt)} · <span className="font-semibold text-foreground">{order.statusLabel}</span>
              </p>
            </>
          )}
        </header>

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-cart lg:gap-5">
          <div className="flex min-w-0 flex-col gap-5">
            {next.type === "instructions" && order.paymentStatus === "unpaid" && !ended ? (
              <section aria-labelledby="payment-next" className="flex flex-col gap-5 rounded-xl bg-brand-tint p-5 outline-1 outline-foreground md:p-7.5">
                <h2 id="payment-next" className={heading}>
                  {next.title}
                </h2>
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)]">
                  {next.lines.map((line) => (
                    <div key={line.label} className="contents">
                      <dt className="text-16 font-medium text-subtle-foreground md:text-18">{line.label}</dt>
                      <dd className="text-18 font-semibold break-all md:text-20">{line.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-16 text-subtle-foreground md:text-18">Use the order number as the payment reference. We ship as soon as the transfer arrives.</p>
              </section>
            ) : null}

            <section aria-labelledby="order-progress" className={card}>
              <h2 id="order-progress" className={heading}>
                Progress
              </h2>
              {ended ? (
                <p className="text-18 font-semibold md:text-20">
                  {order.statusLabel} on {formatDate(order.history.at(-1)?.at ?? order.updatedAt)}.
                  {order.refundedTotal > 0 ? ` ${price(order.refundedTotal)} refunded.` : ""}
                </p>
              ) : (
                <ol className="grid gap-4 sm:grid-cols-4">
                  {STEPS.map((step) => {
                    const done = reached.includes(step.status)
                    const current = order.status === step.status
                    return (
                      <li key={step.status} aria-current={current ? "step" : undefined} className="flex items-center gap-3 sm:flex-col sm:items-start">
                        <span className={cn("h-2 w-10 shrink-0 rounded-full sm:w-full", done ? "bg-foreground" : "bg-surface-sunken")} aria-hidden="true" />
                        <span className={cn("text-16 md:text-18", done ? "font-semibold" : "text-subtle-foreground")}>
                          {step.label}
                          <span className="sr-only">{done ? " (done)" : " (not yet)"}</span>
                        </span>
                      </li>
                    )
                  })}
                </ol>
              )}
              {order.status === "pending_payment" ? <p className="text-16 text-subtle-foreground md:text-18">Awaiting your payment before we confirm the order.</p> : null}
              {order.trackingNumber ? (
                <p className="text-18 md:text-20">
                  Tracking number: <strong className="font-semibold">{order.trackingNumber}</strong>
                </p>
              ) : null}
              {order.returns.map((item) => (
                <p key={item.id} className="text-16 font-medium md:text-18">
                  {RETURN_LABEL[item.status]} · {formatDate(item.createdAt)}
                </p>
              ))}
            </section>

            <section aria-labelledby="order-items" className={card}>
              <h2 id="order-items" className={heading}>
                Items
              </h2>
              <ul className="flex flex-col divide-y divide-border">
                {order.lines.map((line) => (
                  <li key={line.id} className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-4 py-4 first:pt-0 last:pb-0 md:grid-cols-[7rem_minmax(0,1fr)_auto]">
                    <span className="relative aspect-square overflow-hidden rounded-lg bg-well">
                      <Image src={line.imageUrl} alt="" fill sizes="112px" className="object-cover" />
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <Link href={`/products/${line.slug}`} className="text-18 font-semibold hover:underline md:text-20">
                        {line.title}
                      </Link>
                      <span className="text-16 text-subtle-foreground md:text-18">
                        EUR {line.size.eu}
                        {line.condition ? ` · ${conditionLabel(line.condition)}` : ""} · Qty {line.quantity}
                      </span>
                      {line.refundedQuantity > 0 ? <span className="text-16 font-medium text-subtle-foreground">{line.refundedQuantity} refunded</span> : null}
                    </span>
                    <span className="text-18 font-semibold md:text-20">{price(line.total)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <div className="grid gap-5 md:grid-cols-2">
              <section aria-labelledby="order-delivery" className={card}>
                <h2 id="order-delivery" className={heading}>
                  Delivery
                </h2>
                <address className="flex flex-col gap-1 text-18 not-italic md:text-20">
                  <span className="font-semibold">{order.shippingAddress.fullName}</span>
                  <span>{order.shippingAddress.line1}</span>
                  {order.shippingAddress.line2 ? <span>{order.shippingAddress.line2}</span> : null}
                  <span>
                    {order.shippingAddress.city}, {order.shippingAddress.province}
                    {order.shippingAddress.postalCode ? ` ${order.shippingAddress.postalCode}` : ""}
                  </span>
                  <span className="text-subtle-foreground">{order.shippingAddress.phone}</span>
                </address>
                <p className="text-16 text-subtle-foreground md:text-18">
                  {order.shippingMethod.label} · {order.shippingMethod.minDays}–{order.shippingMethod.maxDays} working days
                </p>
              </section>
              <section aria-labelledby="order-payment" className={card}>
                <h2 id="order-payment" className={heading}>
                  Payment
                </h2>
                <p className="text-18 font-semibold md:text-20">{PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}</p>
                <p className="text-16 text-subtle-foreground md:text-18">{order.paymentStatus === "paid" ? "Paid" : order.paymentStatus === "unpaid" ? "Not paid yet" : order.paymentStatus.replace("_", " ")}</p>
              </section>
            </div>
          </div>

          <section aria-labelledby="order-total" className="flex flex-col rounded-2xl bg-background px-5 pt-6 pb-8 shadow-summary-lift outline-1 outline-foreground md:px-7.5 md:pt-7.25">
            <h2 id="order-total" className="text-28 font-bold md:text-34">
              Order Summary
            </h2>
            <dl className="flex flex-col gap-4 pt-6">
              <div className={row}>
                <dt className="text-subtle-foreground">Subtotal</dt>
                <dd>{price(order.subtotal)}</dd>
              </div>
              {order.discountTotal > 0 ? (
                <div className={row}>
                  <dt className="text-subtle-foreground">Discounts{order.promotionCodes.length ? ` (${order.promotionCodes.join(", ")})` : ""}</dt>
                  <dd className="text-success">−{price(order.discountTotal)}</dd>
                </div>
              ) : null}
              <div className={row}>
                <dt className="text-subtle-foreground">Delivery</dt>
                <dd>{order.shippingTotal === 0 ? "Free" : price(order.shippingTotal)}</dd>
              </div>
              {!order.taxIncluded ? (
                <div className={row}>
                  <dt className="text-subtle-foreground">GST</dt>
                  <dd>{price(order.taxTotal)}</dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-4 border-t border-border pt-6 text-24 font-bold md:text-30">
                <dt>Total</dt>
                <dd>{price(order.total)}</dd>
              </div>
              {order.taxIncluded && order.taxTotal > 0 ? (
                <div className="flex justify-end text-14 font-medium text-subtle-foreground md:text-16">
                  <dt className="sr-only">Tax</dt>
                  <dd>Includes {price(order.taxTotal)} GST</dd>
                </div>
              ) : null}
            </dl>
            <OrderActions order={order} token={token} />
          </section>
        </div>
      </Container>
    </div>
  )
}
