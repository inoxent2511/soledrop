import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { PrintReceipt } from "@/features/admin/in-store/print-receipt"
import { conditionLabel, formatPrice } from "@/lib/format"
import { permissionPage } from "@/server/admin/dal"
import { staffOrders } from "@/server/orders"
import { isDomainError } from "@/server/shared/errors"

export const metadata: Metadata = { title: "Shop receipt" }

const date = (value: string) => new Date(value).toLocaleString("en-PK", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" })
export default async function InStoreReceiptPage({ params }: { params: Promise<{ number: string }> }) {
  const staff = await permissionPage("orders:read", "/admin/in-store")
  const { number } = await params
  const { order, piiMasked } = await staffOrders().detail(staff, number).catch((error) => {
    if (isDomainError(error) && error.code === "not_found") notFound()
    throw error
  })
  if (order.shippingMethod.code !== "in_store") notFound()
  const newPair = order.lines.some((line) => line.kind === "new")
  const preLoved = order.lines.some((line) => line.kind === "preloved")
  const tendered = Number(order.customFields.tenderedMinor ?? 0)
  const change = Number(order.customFields.changeMinor ?? 0)
  return <div className="flex flex-col items-center gap-5 print:block print:bg-white">
    <style>{`@page { size: 80mm auto; margin: 0; } .shop-receipt { max-width: 20rem; } @media print { body { background: white !important; } .shop-receipt { width: 80mm; max-width: none; padding: 5mm 4mm; color: black; } }`}</style>
    <div className="flex w-full max-w-md items-center justify-between gap-3 print:hidden">
      <Link href="/admin/in-store" className="text-14 font-semibold underline">← In-store sales</Link>
      <PrintReceipt />
    </div>
    <article aria-label={`Receipt ${order.number}`} className="shop-receipt w-full bg-white p-5 text-foreground shadow-lg print:shadow-none">
      <div className="text-center text-28 font-extrabold italic tracking-tight">Sole<span className="text-brand print:text-foreground">drop</span></div>
      <p className="mb-5 text-center text-10 font-bold tracking-widest">IN-STORE PURCHASE</p>
      <div className="space-y-1 text-12">
        <div className="flex justify-between gap-3"><span>Receipt</span><strong>{order.number}</strong></div>
        <div className="flex justify-between gap-3"><span>Date</span><span>{date(order.placedAt)}</span></div>
        <div className="flex justify-between gap-3"><span>Customer</span><span className="text-end">{order.shippingAddress.fullName}</span></div>
        {!piiMasked && order.phone ? <div className="flex justify-between gap-3"><span>Phone</span><span>{order.phone}</span></div> : null}
      </div>
      <div className="my-4 border-t border-dashed border-border-strong" />
      <h2 className="mb-3 text-10 font-bold tracking-widest">ITEMS PURCHASED</h2>
      <div className="space-y-4">{order.lines.map((line) => <div key={line.id} className="text-12">
        <strong className="block text-14">{line.brand} {line.title}</strong>
        <span>{line.kind === "new" ? "Brand New" : `Pre-Loved${line.condition ? ` · ${conditionLabel(line.condition)}` : ""}`} · EU {line.size.eu} · {line.sku}</span>
        {line.kind === "preloved" && order.customFields[`condition:${line.variantId}`] ? <span className="block break-words text-10">Condition noted: {String(order.customFields[`condition:${line.variantId}`])}</span> : null}
        <div className="mt-1 flex justify-between gap-3"><span>{line.quantity} × {formatPrice(line.unitPrice, "PKR")}</span><strong>{formatPrice(line.total, "PKR")}</strong></div>
        {line.discount ? <div className="text-end text-11">Item discount: − {formatPrice(line.discount, "PKR")}</div> : null}
      </div>)}</div>
      <div className="my-4 border-t border-dashed border-border-strong" />
      <div className="space-y-1 text-12">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatPrice(order.subtotal, "PKR")}</span></div>
        {order.discountTotal ? <div className="flex justify-between"><span>Discount</span><span>− {formatPrice(order.discountTotal, "PKR")}</span></div> : null}
        {order.taxTotal ? <div className="flex justify-between"><span>Tax {order.taxIncluded ? "(included)" : ""}</span><span>{formatPrice(order.taxTotal, "PKR")}</span></div> : null}
        <div className="flex justify-between border-y-2 border-foreground py-2 text-17 font-extrabold"><span>TOTAL</span><span>{formatPrice(order.total, "PKR")}</span></div>
        <div className="flex justify-between"><span>Paid · {order.paymentMethod === "cash" ? "Cash" : "Bank transfer"}</span><span>{formatPrice(order.paymentMethod === "cash" ? tendered : order.total, "PKR")}</span></div>
        {order.paymentMethod === "cash" ? <div className="flex justify-between"><span>Change</span><strong>{formatPrice(change, "PKR")}</strong></div> : null}
      </div>
      <div className="my-4 border-t border-dashed border-border-strong" />
      <section aria-label="Returns information" className="space-y-1 text-10 leading-4">
        <h2 className="font-bold tracking-wider">RETURNS & EXCHANGES</h2>
        <p>For eligible preference returns, contact us within 7 calendar days of receiving your pair. Keep this receipt and contact support before returning an item.</p>
        {newPair ? <p><strong>Brand New:</strong> Indoor fitting only; no outdoor wear. Keep supplied tags, accessories and packaging.</p> : null}
        {preLoved ? <p><strong>Pre-Loved:</strong> Return in materially the same condition; indoor fitting only. Keep the SOLEDROP tag and included parts attached.</p> : null}
        <p>Faulty, wrong or materially misdescribed items are reviewed separately. Your statutory rights remain unaffected.</p>
        <p>Full policy: soledrop.store/returns</p>
      </section>
      <div className="my-4 border-t border-dashed border-border-strong" />
      <p className="text-center text-11 font-bold">THANK YOU FOR SHOPPING WITH US.</p>
      <p className="mt-2 text-center text-10 leading-4"><strong>SOLEDROP</strong><br />{String(order.customFields.shopAddress ?? "")}<br />support@soledrop.store<br />WhatsApp: 0304 5163651</p>
    </article>
    <Link href={`/admin/orders/${encodeURIComponent(order.number)}`} className="text-14 underline print:hidden">View order and returns</Link>
  </div>
}
