import { ArrowRight } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { AdminCard } from "@/components/admin/card"
import { DataTable } from "@/components/admin/data-table"
import { PageHeader } from "@/components/admin/page-header"
import { StatCard } from "@/components/admin/stat-card"
import { StatusPill } from "@/components/admin/status-pill"
import { OrderStatusPill } from "@/features/admin/orders/status"
import { visibleModules } from "@/features/admin/modules"
import { lastWeek } from "@/features/admin/reports/range"
import { formatPrice } from "@/lib/format"
import { can, permissionPage } from "@/server/admin/dal"
import { staffOrders } from "@/server/orders"
import { insights, reports, staffPlatform } from "@/server/reports"

export const metadata: Metadata = { title: "Dashboard" }

const time = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" })

function compare(today: number, average: number): { comparison: string; trend: "up" | "down" | "flat" } {
  if (average === 0) return { comparison: today ? "First sales this week" : "No sales in the last 7 days", trend: "flat" }
  const change = Math.round(((today - average) / average) * 100)
  return { comparison: `${Math.abs(change)}% ${change >= 0 ? "above" : "below"} the 7-day daily average`, trend: change > 0 ? "up" : change < 0 ? "down" : "flat" }
}

/** Today at a glance (A10): sales against the last week, what needs doing, newest orders, recent changes. */
export default async function AdminDashboardPage() {
  const staff = await permissionPage("dashboard:read", "/admin")
  const { from: weekAgo, to: today } = lastWeek()
  const [attention, sales, recent, activity] = await Promise.all([
    insights().attention(staff),
    can(staff, "reports:read") ? reports().sales(staff, weekAgo, today) : Promise.resolve(null),
    can(staff, "orders:read") ? staffOrders().list(staff, { page: 1, pageSize: 8 }) : Promise.resolve(null),
    can(staff, "audit:read") ? staffPlatform().audit(staff, { page: 1, pageSize: 8 }) : Promise.resolve(null),
  ])
  const todayRow = sales?.days.at(-1)
  const previousDays = sales?.days.slice(0, -1) ?? []
  const average = (pick: (row: (typeof previousDays)[number]) => number) => (previousDays.length ? previousDays.reduce((sum, row) => sum + pick(row), 0) / previousDays.length : 0)
  const modules = visibleModules(staff.permissions).filter((module) => module.key !== "dashboard")

  return (
    <>
      <PageHeader title={`Hello, ${staff.member.displayName || staff.member.email}`} description={`Signed in as ${staff.roles.map((role) => role.name).join(", ")}.`} />

      {todayRow ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Net sales today" value={formatPrice(todayRow.net)} {...compare(todayRow.net, average((row) => row.net))} />
          <StatCard label="Orders today" value={todayRow.orders} {...compare(todayRow.orders, average((row) => row.orders))} />
          <StatCard label="Pairs sold today" value={todayRow.items} />
          <StatCard label="Last 7 days" value={formatPrice(sales?.totals.net ?? 0)} comparison={`${sales?.totals.orders ?? 0} orders · average ${formatPrice(sales?.totals.averageOrder ?? 0)}`} />
        </div>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <AdminCard title="Needs attention" className="xl:col-span-1">
          {attention.length === 0 ? <p className="text-16 text-subtle-foreground">All clear. Nothing waiting on you.</p> : null}
          <ul className="flex flex-col gap-1">
            {attention.map((item) => (
              <li key={item.key}>
                <Link href={item.href} prefetch={false} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5 text-16 transition-colors hover:border-foreground">
                  <span className="flex items-center gap-2">
                    <StatusPill tone={item.tone}>{item.count}</StatusPill> {item.label}
                  </span>
                  <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        </AdminCard>

        {recent ? (
          <AdminCard
            title="Latest orders"
            className="xl:col-span-2"
            actions={
              <Link href="/admin/orders" prefetch={false} className="text-14 font-semibold underline underline-offset-4">
                All orders
              </Link>
            }
          >
            <DataTable
              caption="Latest orders"
              rows={recent.orders}
              rowKey={(order) => order.id}
              href={(order) => `/admin/orders/${order.number}`}
              empty={<p className="text-16 text-subtle-foreground">No orders yet.</p>}
              columns={[
                { key: "number", header: "Order", render: (order) => order.number },
                { key: "placed", header: "Placed", hideBelow: "sm", render: (order) => time(order.placedAt) },
                { key: "customer", header: "Customer", hideBelow: "md", render: (order) => order.customer },
                { key: "status", header: "Status", render: (order) => <OrderStatusPill status={order.status} /> },
                { key: "total", header: "Total", align: "end", render: (order) => formatPrice(order.total, order.currency) },
              ]}
            />
          </AdminCard>
        ) : (
          <AdminCard title="Where to next" className="xl:col-span-2">
            <ul className="grid gap-2 sm:grid-cols-2">
              {modules.map((module) => {
                const Icon = module.icon
                return (
                  <li key={module.key}>
                    <Link href={module.href} className="flex h-14 items-center gap-3 rounded-md border border-border px-4 text-16 font-semibold transition-colors hover:border-foreground">
                      <Icon aria-hidden className="size-5" />
                      {module.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </AdminCard>
        )}
      </div>

      {sales?.topProducts.length ? (
        <AdminCard title="Best sellers this week">
          <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {sales.topProducts.slice(0, 5).map((product, index) => (
              <li key={product.productId} className="flex flex-col gap-0.5 rounded-md border border-border p-3">
                <span className="text-14 text-subtle-foreground">#{index + 1}</span>
                <span className="text-16 font-semibold">{product.title}</span>
                <span className="text-14 tabular-nums">
                  {product.units} pairs · {formatPrice(product.revenue)}
                </span>
              </li>
            ))}
          </ol>
        </AdminCard>
      ) : null}

      {activity ? (
        <AdminCard
          title="Recent changes"
          actions={
            <Link href="/admin/audit" className="text-14 font-semibold underline underline-offset-4">
              Audit log
            </Link>
          }
        >
          {activity.entries.length === 0 ? <p className="text-16 text-subtle-foreground">Nothing yet.</p> : null}
          <ul className="flex flex-col divide-y divide-border text-16">
            {activity.entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="min-w-0 break-all">
                  <code className="text-14 font-semibold">{entry.action}</code> <span className="text-subtle-foreground">{entry.entityId !== "*" ? entry.entityId : ""}</span>
                </span>
                <span className="text-14 text-subtle-foreground">{time(entry.at)}</span>
              </li>
            ))}
          </ul>
        </AdminCard>
      ) : null}
    </>
  )
}
