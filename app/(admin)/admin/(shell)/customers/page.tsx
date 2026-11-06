import { Users } from "lucide-react"
import type { Metadata } from "next"
import { z } from "zod"

import { DataTable } from "@/components/admin/data-table"
import { EmptyState } from "@/components/admin/empty-state"
import { FilterBar } from "@/components/admin/filter-bar"
import { PageHeader } from "@/components/admin/page-header"
import { Pagination } from "@/components/admin/pagination"
import { StatusPill } from "@/components/admin/status-pill"
import { formatDate } from "@/lib/format"
import { permissionPage } from "@/server/admin/dal"
import { staffCustomers } from "@/server/customers"
import type { StaffCustomerRow } from "@/server/customers/staff"

export const metadata: Metadata = { title: "Customers" }

const params = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  view: z.enum(["wholesale", "subscribed"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
})

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await permissionPage("customers:read", "/admin/customers")
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))
  const query = params.parse({ page: 1, ...raw })
  const pageSize = 25
  const { rows, total } = await staffCustomers().list(staff, { q: query.q, group: query.view === "wholesale" ? "wholesale" : undefined, marketing: query.view === "subscribed" ? true : undefined, page: query.page, pageSize })
  return (
    <>
      <PageHeader title="Customers" description="Shoppers with an account. Guests appear on their orders only." />
      <FilterBar
        searchLabel="Search by email, name or phone"
        fields={[]}
        views={[
          { key: "all", label: "All" },
          { key: "wholesale", label: "Wholesale" },
          { key: "subscribed", label: "Marketing opt-in" },
        ]}
      />
      <DataTable<StaffCustomerRow>
        caption="Customers"
        rows={rows}
        rowKey={(row) => row.id}
        href={(row) => `/admin/customers/${row.id}`}
        empty={<EmptyState icon={Users} title={query.q || query.view ? "No customers match" : "No customers yet"}>{query.q || query.view ? "Try a different search." : "Accounts appear when shoppers register."}</EmptyState>}
        columns={[
          { key: "name", header: "Customer", render: (row) => row.fullName },
          { key: "email", header: "Email", hideBelow: "sm", render: (row) => row.email },
          { key: "phone", header: "Phone", hideBelow: "lg", render: (row) => row.phone ?? "—" },
          { key: "group", header: "Group", hideBelow: "md", render: (row) => (row.group === "wholesale" ? <StatusPill tone="info">Wholesale</StatusPill> : "Retail") },
          { key: "marketing", header: "Marketing", hideBelow: "lg", render: (row) => (row.marketingOptIn ? "Yes" : "No") },
          { key: "since", header: "Since", render: (row) => formatDate(row.createdAt) },
        ]}
      />
      <Pagination basePath="/admin/customers" params={raw} page={query.page} pageSize={pageSize} total={total} />
    </>
  )
}
