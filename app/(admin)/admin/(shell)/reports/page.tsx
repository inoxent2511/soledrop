import { Download } from "lucide-react"
import type { Metadata } from "next"

import { adminButton } from "@/components/admin/button"
import { AdminCard } from "@/components/admin/card"
import { DataTable } from "@/components/admin/data-table"
import { FilterBar } from "@/components/admin/filter-bar"
import { PageHeader } from "@/components/admin/page-header"
import { PAYMENT_METHOD } from "@/features/admin/orders/status"
import { reportRange } from "@/features/admin/reports/range"
import { formatPrice } from "@/lib/format"
import { can, permissionPage } from "@/server/admin/dal"
import { reports } from "@/server/reports"

export const metadata: Metadata = { title: "Reports" }

const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await permissionPage("reports:read", "/admin/reports")
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))
  const { from, to } = reportRange(raw)
  const service = reports()
  const [sales, stock] = await Promise.all([service.sales(staff, from, to), service.inventoryValue(staff)])
  const kindTotal = sales.kinds.new + sales.kinds.preloved

  return (
    <>
      <PageHeader
        title="Reports"
        description={`Sales from ${dayLabel(from)} to ${dayLabel(to)} (Pakistan time). Cancelled orders are left out; net = sales − refunds.`}
        actions={
          can(staff, "reports:export") ? (
            <a href={`/api/admin/reports/sales/export?from=${from}&to=${to}`} download className={adminButton({ tone: "secondary", size: "sm" })}>
              <Download aria-hidden /> Export CSV
            </a>
          ) : null
        }
      />
      <FilterBar
        fields={[
          { kind: "date", name: "from", label: "From" },
          { kind: "date", name: "to", label: "To" },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Net sales", formatPrice(sales.totals.net)],
          ["Orders", sales.totals.orders.toLocaleString("en-US")],
          ["Average order", formatPrice(sales.totals.averageOrder)],
          ["Pairs sold", sales.totals.items.toLocaleString("en-US")],
          ["Refunded", formatPrice(sales.totals.refunds)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-background p-4">
            <p className="text-14 text-subtle-foreground">{label}</p>
            <p className="text-24 font-extrabold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <AdminCard title="By day" className="xl:col-span-2">
          <DataTable
            caption="Sales by day"
            rows={[...sales.days].reverse()}
            rowKey={(row) => row.day}
            columns={[
              { key: "day", header: "Day", render: (row) => dayLabel(row.day) },
              { key: "orders", header: "Orders", align: "end", render: (row) => row.orders },
              { key: "items", header: "Pairs", align: "end", hideBelow: "sm", render: (row) => row.items },
              { key: "gross", header: "Sales", align: "end", hideBelow: "md", render: (row) => formatPrice(row.gross) },
              { key: "refunds", header: "Refunds", align: "end", hideBelow: "md", render: (row) => (row.refunds ? `−${formatPrice(row.refunds)}` : "—") },
              { key: "net", header: "Net", align: "end", render: (row) => formatPrice(row.net) },
              { key: "cancelled", header: "Cancelled", align: "end", hideBelow: "lg", render: (row) => row.cancelled || "—" },
            ]}
          />
        </AdminCard>
        <div className="flex flex-col gap-6">
          <AdminCard title="Brand new and pre-loved">
            <dl className="grid grid-cols-2 gap-y-1 text-16 tabular-nums">
              <dt>Brand new</dt>
              <dd className="text-end">
                {formatPrice(sales.kinds.new)} {kindTotal ? `(${Math.round((sales.kinds.new / kindTotal) * 100)}%)` : ""}
              </dd>
              <dt>Pre-loved</dt>
              <dd className="text-end">
                {formatPrice(sales.kinds.preloved)} {kindTotal ? `(${Math.round((sales.kinds.preloved / kindTotal) * 100)}%)` : ""}
              </dd>
            </dl>
          </AdminCard>
          <AdminCard title="By payment method">
            {sales.methods.length === 0 ? <p className="text-16 text-subtle-foreground">No orders.</p> : null}
            <dl className="grid grid-cols-2 gap-y-1 text-16 tabular-nums">
              {sales.methods.map((row) => (
                <div key={row.method} className="col-span-2 grid grid-cols-2">
                  <dt>
                    {PAYMENT_METHOD[row.method] ?? row.method} ({row.orders})
                  </dt>
                  <dd className="text-end">{formatPrice(row.total)}</dd>
                </div>
              ))}
            </dl>
          </AdminCard>
          <AdminCard title="Stock on hand" description="At base prices, every live and draft size.">
            <dl className="grid grid-cols-2 gap-y-1 text-16 tabular-nums">
              <dt>Worth</dt>
              <dd className="text-end font-bold">{formatPrice(stock.value)}</dd>
              <dt>Pairs</dt>
              <dd className="text-end">{stock.units.toLocaleString("en-US")}</dd>
              <dt>Sizes sold out</dt>
              <dd className="text-end">
                {stock.soldOut} of {stock.sizes}
              </dd>
            </dl>
          </AdminCard>
        </div>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <AdminCard title="Best sellers">
          <DataTable
            caption="Best-selling products"
            rows={sales.topProducts}
            rowKey={(row) => row.productId}
            empty={<p className="text-16 text-subtle-foreground">No sales in this period.</p>}
            columns={[
              { key: "title", header: "Product", render: (row) => row.title },
              { key: "units", header: "Pairs", align: "end", render: (row) => row.units },
              { key: "revenue", header: "Sales", align: "end", render: (row) => formatPrice(row.revenue) },
            ]}
          />
        </AdminCard>
        <AdminCard title="Codes used">
          <DataTable
            caption="Promotion codes used"
            rows={sales.promotionCodes}
            rowKey={(row) => row.code}
            empty={<p className="text-16 text-subtle-foreground">No codes used in this period.</p>}
            columns={[
              { key: "code", header: "Code", render: (row) => <code className="text-14">{row.code}</code> },
              { key: "count", header: "Orders", align: "end", render: (row) => row.count },
            ]}
          />
        </AdminCard>
      </div>
    </>
  )
}
