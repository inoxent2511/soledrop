import { Printer } from "lucide-react"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"

import { adminButton } from "@/components/admin/button"
import { AdminCard } from "@/components/admin/card"
import { DetailLayout } from "@/components/admin/detail-layout"
import { PageHeader } from "@/components/admin/page-header"
import { StatusPill } from "@/components/admin/status-pill"
import { Timeline, type TimelineEvent } from "@/components/admin/timeline"
import { OrderActions } from "@/features/admin/orders/components/order-actions"
import { OrderNoteForm, ReturnActions } from "@/features/admin/orders/components/order-notes"
import { ORDER_STATUS, OrderStatusPill, PAYMENT_METHOD, PaymentStatusPill } from "@/features/admin/orders/status"
import { conditionLabel, formatPrice } from "@/lib/format"
import { permissionPage } from "@/server/admin/dal"
import { staffOrders } from "@/server/orders"
import { isDomainError } from "@/server/shared/errors"

type Props = { params: Promise<{ number: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Order ${(await params).number}` }
}

const actorLabel = (actor: string) => (actor.startsWith("staff:") ? "Staff" : actor === "customer" ? "Customer" : actor.startsWith("payment:") ? "Payment" : actor.startsWith("api:") ? "API" : actor)

export default async function AdminOrderPage({ params }: Props) {
  const { number } = await params
  const staff = await permissionPage("orders:read", `/admin/orders/${number}`)
  const detail = await staffOrders()
    .detail(staff, number)
    .catch((error) => {
      if (isDomainError(error) && error.code === "not_found") notFound()
      throw error
    })
  const { order, payments, refunds, returns, notes, actions } = detail
  const money = (amount: number) => formatPrice(amount, order.currency)
  const paid = payments.filter((payment) => payment.status !== "failed" && payment.status !== "pending" && payment.status !== "authorized").reduce((total, payment) => total + payment.amount, 0)

  const events: TimelineEvent[] = [
    ...order.history.map((entry, index) => ({
      id: `h${index}`,
      at: entry.at,
      title: entry.from ? `${ORDER_STATUS[entry.from].label} → ${ORDER_STATUS[entry.to].label}` : `Placed (${ORDER_STATUS[entry.to].label.toLowerCase()})`,
      detail: entry.note,
      actor: actorLabel(entry.actor),
    })),
    // The first history entry (from: null) is the placement itself; older orders may lack it.
    ...(order.history.some((entry) => entry.from === null) ? [] : [{ id: "placed", at: order.placedAt, title: "Order placed", actor: order.customerId ? "Customer account" : "Guest checkout" }]),
    ...payments.map((payment) => ({ id: payment.id, at: payment.createdAt, title: `Payment ${payment.status} · ${money(payment.amount)}`, detail: [PAYMENT_METHOD[payment.provider] ?? payment.provider, payment.providerRef].filter(Boolean).join(" · ") })),
    ...refunds.map((refund) => ({ id: refund.id, at: refund.createdAt, title: `Refunded ${money(refund.amount)}`, detail: refund.reason })),
    ...notes.map((note) => ({ id: note.id, at: note.createdAt, title: "Staff note", detail: <span className="whitespace-pre-line text-foreground">{note.body}</span>, actor: note.authorName })),
  ]

  return (
    <>
      <PageHeader
        title={`Order ${order.number}`}
        crumbs={[{ label: "Orders", href: "/admin/orders" }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <OrderStatusPill status={order.status} />
            <PaymentStatusPill status={order.paymentStatus} />
            <span>Placed {new Date(order.placedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" })}</span>
          </span>
        }
        actions={
          <Link prefetch={false} href={`/admin/orders/${order.number}/packing-slip`} className={adminButton({ tone: "secondary", size: "sm" })} target="_blank">
            <Printer aria-hidden /> Packing slip
          </Link>
        }
      />
      <DetailLayout
        main={
          <>
            <AdminCard title={`Items (${order.lines.reduce((count, line) => count + line.quantity, 0)})`}>
              <ul className="flex flex-col divide-y divide-border">
                {order.lines.map((line) => (
                  <li key={line.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <Image src={line.imageUrl} alt="" width={64} height={64} className="size-16 shrink-0 rounded-md bg-surface object-contain" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <Link prefetch={false} href={`/products/${line.slug}`} target="_blank" className="font-semibold underline-offset-4 hover:underline">
                        {line.brand} {line.title}
                      </Link>
                      <p className="text-14 text-subtle-foreground">
                        UK {line.size.uk} · EU {line.size.eu} · {line.kind === "preloved" && line.condition ? conditionLabel(line.condition) : "Brand new"} · SKU {line.sku}
                      </p>
                      {line.refundedQuantity > 0 ? <StatusPill tone="neutral">{line.refundedQuantity} refunded</StatusPill> : null}
                    </div>
                    <div className="text-end text-16 tabular-nums">
                      <p>
                        {line.quantity} × {money(line.unitPrice)}
                      </p>
                      <p className="font-semibold">{money(line.total)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </AdminCard>

            {returns.length > 0 ? (
              <AdminCard title="Returns">
                <ul className="flex flex-col gap-4">
                  {returns.map((request) => (
                    <li key={request.id} className="flex flex-col gap-2">
                      <p className="flex items-center gap-2 text-16 font-semibold">
                        Return <StatusPill tone={request.status === "requested" ? "pending" : request.status === "rejected" ? "danger" : "success"}>{request.status}</StatusPill>
                      </p>
                      <p className="text-14 text-subtle-foreground">
                        {request.lines.map((item) => `${item.quantity} × ${order.lines.find((line) => line.id === item.orderLineId)?.title ?? "item"}`).join(", ")} · “{request.reason}”
                      </p>
                      {actions.returns ? <ReturnActions number={order.number} returnId={request.id} status={request.status} /> : null}
                    </li>
                  ))}
                </ul>
              </AdminCard>
            ) : null}

            <AdminCard title="History">
              <Timeline label="Order history" events={events} />
              {actions.note ? <OrderNoteForm number={order.number} /> : null}
            </AdminCard>
          </>
        }
        side={
          <>
            <AdminCard title="Actions">
              <OrderActions
                number={order.number}
                updatedAt={order.updatedAt}
                currency={order.currency}
                outstanding={Math.max(0, order.total - paid)}
                trackingNumber={order.trackingNumber}
                lines={order.lines.map((line) => ({ id: line.id, title: `${line.brand} ${line.title}`, size: `UK ${line.size.uk}`, quantity: line.quantity, refundedQuantity: line.refundedQuantity, total: line.total }))}
                actions={actions}
              />
            </AdminCard>
            <AdminCard title="Customer" description={detail.piiMasked ? "Contact details are hidden for your role." : undefined}>
              <address className="flex flex-col gap-0.5 text-16 not-italic">
                <span className="font-semibold">{order.shippingAddress.fullName}</span>
                <span className="break-all">{order.email}</span>
                <span>{order.phone}</span>
                <span className="pt-2 text-14 text-subtle-foreground">
                  {[order.shippingAddress.line1, order.shippingAddress.line2, order.shippingAddress.city, order.shippingAddress.province, order.shippingAddress.postalCode].filter(Boolean).join(", ")}
                </span>
              </address>
              {order.customerId && staff.permissions.includes("customers:read") ? (
                <Link prefetch={false} href={`/admin/customers/${order.customerId}`} className="text-14 font-semibold underline underline-offset-4">
                  View customer
                </Link>
              ) : null}
            </AdminCard>
            <AdminCard title="Summary">
              <dl className="grid grid-cols-2 gap-y-1.5 text-16 tabular-nums">
                <dt>Subtotal</dt>
                <dd className="text-end">{money(order.subtotal)}</dd>
                {order.discountTotal ? (
                  <>
                    <dt>Discount {order.promotionCodes.length ? `(${order.promotionCodes.join(", ")})` : ""}</dt>
                    <dd className="text-end">−{money(order.discountTotal)}</dd>
                  </>
                ) : null}
                <dt>Shipping · {order.shippingMethod.label}</dt>
                <dd className="text-end">{money(order.shippingTotal)}</dd>
                {order.taxTotal ? (
                  <>
                    <dt>Tax {order.taxIncluded ? "(included)" : ""}</dt>
                    <dd className="text-end">{money(order.taxTotal)}</dd>
                  </>
                ) : null}
                <dt className="border-t border-border pt-1.5 font-bold">Total</dt>
                <dd className="border-t border-border pt-1.5 text-end font-bold">{money(order.total)}</dd>
                <dt>Paid · {PAYMENT_METHOD[order.paymentMethod] ?? order.paymentMethod}</dt>
                <dd className="text-end">{money(paid)}</dd>
                {order.refundedTotal ? (
                  <>
                    <dt>Refunded</dt>
                    <dd className="text-end">−{money(order.refundedTotal)}</dd>
                  </>
                ) : null}
              </dl>
              {order.trackingNumber ? <p className="text-14">Tracking: <span className="font-mono font-semibold">{order.trackingNumber}</span></p> : null}
            </AdminCard>
          </>
        }
      />
    </>
  )
}
