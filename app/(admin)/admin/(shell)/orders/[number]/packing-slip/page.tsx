import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { conditionLabel } from "@/lib/format"
import { permissionPage } from "@/server/admin/dal"
import { staffOrders } from "@/server/orders"
import { isDomainError } from "@/server/shared/errors"

type Props = { params: Promise<{ number: string }> }

export const metadata: Metadata = { title: "Packing slip" }

/** A print-ready packing slip: address, items, sizes, conditions; no prices. Print from the browser. */
export default async function PackingSlipPage({ params }: Props) {
  const { number } = await params
  const staff = await permissionPage("orders:read", `/admin/orders/${number}/packing-slip`)
  const { order } = await staffOrders()
    .detail(staff, number)
    .catch((error) => {
      if (isDomainError(error) && error.code === "not_found") notFound()
      throw error
    })
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-lg border border-border bg-background p-6 print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-foreground pb-4">
        <div>
          <p className="font-display text-24 font-extrabold">Sole Drop</p>
          <p className="text-14 text-subtle-foreground">Packing slip</p>
        </div>
        <div className="text-end">
          <p className="text-20 font-extrabold">{order.number}</p>
          <p className="text-14">{new Date(order.placedAt).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "Asia/Karachi" })}</p>
        </div>
      </header>
      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="text-14 font-bold text-subtle-foreground uppercase">Ship to</h2>
          <address className="text-16 not-italic">
            {order.shippingAddress.fullName}
            <br />
            {order.shippingAddress.line1}
            {order.shippingAddress.line2 ? (
              <>
                <br />
                {order.shippingAddress.line2}
              </>
            ) : null}
            <br />
            {order.shippingAddress.city}, {order.shippingAddress.province} {order.shippingAddress.postalCode ?? ""}
            <br />
            {order.phone}
          </address>
        </div>
        <div>
          <h2 className="text-14 font-bold text-subtle-foreground uppercase">Delivery</h2>
          <p className="text-16">{order.shippingMethod.label}</p>
          <p className="text-16">{order.paymentMethod === "cod" ? "Collect cash on delivery" : "Prepaid"}</p>
          {order.trackingNumber ? <p className="font-mono text-16">{order.trackingNumber}</p> : null}
        </div>
      </section>
      <table className="w-full border-collapse text-16">
        <thead>
          <tr className="border-b border-foreground text-start text-14">
            <th className="py-2 text-start">Item</th>
            <th className="py-2 text-start">Size</th>
            <th className="py-2 text-start">Condition</th>
            <th className="py-2 text-end">Qty</th>
            <th className="py-2 text-center">Packed</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((line) => (
            <tr key={line.id} className="border-b border-border">
              <td className="py-2">
                {line.brand} {line.title}
                <span className="block text-14 text-subtle-foreground">SKU {line.sku}</span>
              </td>
              <td className="py-2">UK {line.size.uk} / EU {line.size.eu}</td>
              <td className="py-2">{line.kind === "preloved" && line.condition ? conditionLabel(line.condition) : "Brand new"}</td>
              <td className="py-2 text-end tabular-nums">{line.quantity - line.refundedQuantity}</td>
              <td className="py-2 text-center">☐</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-14 text-subtle-foreground">Thank you for shopping with Sole Drop. Returns and exchanges: see the Returns policy on our website.</p>
    </article>
  )
}
