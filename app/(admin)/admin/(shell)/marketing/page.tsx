import { Mail, ShoppingBag } from "lucide-react"
import type { Metadata } from "next"
import { z } from "zod"

import { DataTable } from "@/components/admin/data-table"
import { EmptyState } from "@/components/admin/empty-state"
import { FilterBar } from "@/components/admin/filter-bar"
import { PageHeader } from "@/components/admin/page-header"
import { Pagination } from "@/components/admin/pagination"
import { StatusPill } from "@/components/admin/status-pill"
import { ExportSubscribers } from "@/features/admin/marketing/components/export-subscribers"
import { formatDate, formatPrice } from "@/lib/format"
import { can, permissionPage } from "@/server/admin/dal"
import { staffMarketing } from "@/server/reports"

export const metadata: Metadata = { title: "Marketing" }

const params = z.object({ view: z.enum(["abandoned", "unsubscribed"]).optional().catch(undefined), page: z.coerce.number().int().min(1).max(10_000).catch(1) })
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" })

export default async function AdminMarketingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await permissionPage("marketing:read", "/admin/marketing")
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))
  const query = params.parse({ page: 1, ...raw })
  const service = staffMarketing()
  const views = (
    <FilterBar
      fields={[]}
      views={[
        { key: "subscribed", label: "Newsletter" },
        { key: "unsubscribed", label: "Unsubscribed" },
        { key: "abandoned", label: "Abandoned bags" },
      ]}
    />
  )

  if (query.view === "abandoned") {
    const { rows, total } = await service.abandoned(staff, { olderThanHours: 2, page: query.page, pageSize: 50 })
    return (
      <>
        <PageHeader title="Marketing" description="Bags with pairs in them that haven't been touched for two hours or more." />
        {views}
        <DataTable
          caption="Abandoned bags"
          rows={rows}
          rowKey={(row) => row.id}
          empty={<EmptyState icon={ShoppingBag} title="No abandoned bags">Bags appear here once they sit untouched for two hours.</EmptyState>}
          columns={[
            { key: "when", header: "Last touched", render: (row) => when(row.updatedAt) },
            { key: "who", header: "Shopper", render: (row) => (row.customer ? `${row.customer.name} · ${row.customer.email}` : <span className="text-subtle-foreground">Guest</span>) },
            { key: "items", header: "In the bag", hideBelow: "md", render: (row) => row.items.map((item) => `${item.quantity} × ${item.title} ${item.size}`).join(", ") },
            { key: "value", header: "Value", align: "end", render: (row) => formatPrice(row.value) },
          ]}
        />
        <Pagination basePath="/admin/marketing" params={raw} page={query.page} pageSize={50} total={total} />
      </>
    )
  }

  const status = query.view === "unsubscribed" ? "unsubscribed" : "subscribed"
  const { rows, total } = await service.subscribers(staff, { status, page: query.page, pageSize: 50 })
  return (
    <>
      <PageHeader title="Marketing" description="Newsletter sign-ups (with their consent date) and bags shoppers left behind." actions={can(staff, "marketing:export") ? <ExportSubscribers /> : null} />
      {views}
      <DataTable
        caption="Newsletter subscribers"
        rows={rows}
        rowKey={(row) => row.email}
        empty={<EmptyState icon={Mail} title="Nobody here yet">Sign-ups from the footer and checkout appear here.</EmptyState>}
        columns={[
          { key: "email", header: "Email", render: (row) => row.email },
          { key: "source", header: "Signed up from", hideBelow: "sm", render: (row) => row.source },
          { key: "status", header: "Status", render: (row) => <StatusPill tone={row.status === "subscribed" ? "success" : "neutral"}>{row.status === "subscribed" ? "Subscribed" : "Unsubscribed"}</StatusPill> },
          { key: "consent", header: "Consent", render: (row) => formatDate(row.consentAt) },
        ]}
      />
      <Pagination basePath="/admin/marketing" params={raw} page={query.page} pageSize={50} total={total} />
    </>
  )
}
