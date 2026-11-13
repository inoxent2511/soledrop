import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/admin/page-header"
import { SaleForm } from "@/features/admin/in-store/sale-form"
import { formatPrice } from "@/lib/format"
import { can, permissionPage } from "@/server/admin/dal"
import { recentInStoreSales, searchInStoreProducts } from "@/server/orders/in-store"

export const metadata: Metadata = { title: "In-store sales" }

export default async function InStoreSalesPage() {
  const staff = await permissionPage("orders:write", "/admin/in-store")
  const allowed = can(staff, "orders:read") && can(staff, "orders:mark_paid") && can(staff, "inventory:adjust") && can(staff, "products:read")
  const [products, recent] = allowed ? await Promise.all([searchInStoreProducts(staff, "", "new"), recentInStoreSales(staff)]) : [[], []]
  return <>
    <PageHeader title="In-store sales" description="Record a paid shop purchase, hand over the pairs, and print a receipt. Stock is updated immediately." />
    {!allowed ? <p className="rounded-lg border border-border bg-background p-5 text-14">This screen needs product read, inventory adjustment, and payment recording permissions. Ask the owner to update your role.</p> : <SaleForm initialProducts={products} />}
    {allowed ? <section className="rounded-lg border border-border bg-background p-5" aria-labelledby="recent-shop-sales">
      <h2 id="recent-shop-sales" className="mb-4 text-20 font-semibold">Recent shop receipts</h2>
      {recent.length ? <div className="divide-y divide-border">{recent.map((sale) => <Link key={sale.number} href={`/admin/in-store/${encodeURIComponent(sale.number)}/receipt`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-14 hover:underline">
        <span className="font-semibold">{sale.number} · {sale.customer}</span>
        <span>{new Date(sale.placedAt).toLocaleString("en-PK", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" })} · {formatPrice(sale.total, "PKR")}</span>
      </Link>)}</div> : <p className="text-14 text-subtle-foreground">No in-store sales yet.</p>}
    </section> : null}
  </>
}
