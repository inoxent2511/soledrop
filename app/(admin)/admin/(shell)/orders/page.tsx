import { Download, Receipt } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { adminButton } from "@/components/admin/button"
import { DataTable } from "@/components/admin/data-table"
import { EmptyState } from "@/components/admin/empty-state"
import { FilterBar } from "@/components/admin/filter-bar"
import { PageHeader } from "@/components/admin/page-header"
import { Pagination } from "@/components/admin/pagination"
import { ORDER_VIEWS, PAYMENT_STATUSES, parseOrderParams, toOrderQuery } from "@/features/admin/orders/query"
import { OrderStatusPill, PAYMENT_METHOD, PAYMENT_STATUS, PaymentStatusPill } from "@/features/admin/orders/status"
import { formatPrice } from "@/lib/format"
import { can, permissionPage } from "@/server/admin/dal"
import { staffOrders } from "@/server/orders"
import type { StaffOrderSummary } from "@/server/orders/staff"

export const metadata: Metadata = { title: "Orders" }

const placed = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" })

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await permissionPage("orders:read", "/admin/orders")
  const raw = await searchParams
  const params = parseOrderParams(raw)
  const { orders, total } = await staffOrders().list(staff, toOrderQuery(params))
  const urlParams = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))
  const exportQuery = new URLSearchParams(Object.entries(urlParams).filter((entry): entry is [string, string] => Boolean(entry[1]) && entry[0] !== "page")).toString()

  return (
    <>
      <PageHeader
        title="Orders"
        description="Find an order, then pack, ship, take payment, refund or handle a return."
        actions={<div className="flex flex-wrap gap-2">
          {can(staff, "orders:write") && can(staff, "orders:mark_paid") && can(staff, "inventory:adjust") && can(staff, "products:read") ? <Link href="/admin/in-store" className={adminButton({ tone: "primary", size: "sm" })}>New in-store sale</Link> : null}
          {can(staff, "orders:export") ? <a href={`/api/admin/orders/export${exportQuery ? `?${exportQuery}` : ""}`} className={adminButton({ tone: "secondary", size: "sm" })} download><Download aria-hidden /> Export CSV</a> : null}
        </div>}
      />
      <FilterBar
        searchLabel="Search orders"
        views={ORDER_VIEWS.map(({ key, label }) => ({ key, label }))}
        fields={[
          { kind: "select", name: "payment", label: "Payment", options: PAYMENT_STATUSES.map((value) => ({ value, label: PAYMENT_STATUS[value].label })) },
          { kind: "select", name: "method", label: "Method", options: Object.entries(PAYMENT_METHOD).map(([value, label]) => ({ value, label })) },
          { kind: "date", name: "from", label: "From" },
          { kind: "date", name: "to", label: "To" },
          {
            kind: "select",
            name: "sort",
            label: "Sort",
            options: [
              { value: "placed_asc", label: "Oldest first" },
              { value: "total_desc", label: "Highest total" },
              { value: "total_asc", label: "Lowest total" },
            ],
          },
        ]}
      />
      <DataTable<StaffOrderSummary>
        caption="Orders"
        rows={orders}
        rowKey={(order) => order.id}
        href={(order) => `/admin/orders/${order.number}`}
        empty={
          <EmptyState icon={Receipt} title={params.q || params.view || params.payment.length ? "No orders match" : "No orders yet"}>
            {params.q || params.view || params.payment.length ? "Try a different search or clear the filters." : "Orders appear here as soon as a shopper checks out."}
          </EmptyState>
        }
        columns={[
          { key: "number", header: "Order", render: (order) => order.number },
          { key: "placed", header: "Placed", render: (order) => placed(order.placedAt) },
          {
            key: "customer",
            header: "Customer",
            hideBelow: "md",
            render: (order) => (
              <span className="flex flex-col">
                <span>{order.customer}</span>
                <span className="text-14 text-subtle-foreground">{order.email}</span>
              </span>
            ),
          },
          { key: "status", header: "Status", render: (order) => <OrderStatusPill status={order.status} /> },
          { key: "payment", header: "Payment", hideBelow: "sm", render: (order) => <PaymentStatusPill status={order.paymentStatus} /> },
          { key: "method", header: "Method", hideBelow: "lg", render: (order) => PAYMENT_METHOD[order.paymentMethod] ?? order.paymentMethod },
          { key: "items", header: "Items", align: "end", hideBelow: "lg", render: (order) => order.items },
          { key: "total", header: "Total", align: "end", render: (order) => formatPrice(order.total, order.currency) },
        ]}
      />
      <Pagination basePath="/admin/orders" params={urlParams} page={params.page} pageSize={params.size} total={total} />
    </>
  )
}
