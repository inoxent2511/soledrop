import { Download, Package, Plus, Upload } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { z } from "zod"

import { adminButton } from "@/components/admin/button"
import { DataTable } from "@/components/admin/data-table"
import { EmptyState } from "@/components/admin/empty-state"
import { FilterBar } from "@/components/admin/filter-bar"
import { PageHeader } from "@/components/admin/page-header"
import { Pagination } from "@/components/admin/pagination"
import { StatusPill } from "@/components/admin/status-pill"
import { formatPrice } from "@/lib/format"
import { can, permissionPage } from "@/server/admin/dal"
import { staffCatalog } from "@/server/catalog"
import type { StaffProductRow } from "@/server/catalog/staff"

export const metadata: Metadata = { title: "Products" }

const STATUS = { active: { label: "Live", tone: "success" }, draft: { label: "Draft", tone: "pending" }, archived: { label: "Archived", tone: "neutral" } } as const

const params = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  view: z.enum(["active", "draft", "archived"]).optional().catch(undefined),
  kind: z.enum(["new", "preloved"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
})

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await permissionPage("products:read", "/admin/products")
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))
  const query = params.parse({ page: 1, ...raw })
  const pageSize = 25
  const { rows, total } = await staffCatalog().listProducts(staff, { q: query.q, status: query.view ? [query.view] : undefined, kind: query.kind, page: query.page, pageSize })

  return (
    <>
      <PageHeader
        title="Products"
        description="Every pair in the catalogue: drafts, live and archived."
        actions={
          <>
            {can(staff, "products:export") ? (
              <a href="/api/admin/products/export" download className={adminButton({ tone: "ghost", size: "sm" })}>
                <Download aria-hidden /> Export
              </a>
            ) : null}
            {can(staff, "products:import") ? (
              <Link href="/admin/products/import" className={adminButton({ tone: "secondary", size: "sm" })}>
                <Upload aria-hidden /> Import
              </Link>
            ) : null}
            {can(staff, "products:write") ? (
              <Link href="/admin/products/new" className={adminButton({ tone: "primary", size: "sm" })}>
                <Plus aria-hidden /> New product
              </Link>
            ) : null}
          </>
        }
      />
      <FilterBar
        searchLabel="Search products"
        views={[
          { key: "all", label: "All" },
          { key: "active", label: "Live" },
          { key: "draft", label: "Drafts" },
          { key: "archived", label: "Archived" },
        ]}
        fields={[
          {
            kind: "select",
            name: "kind",
            label: "Type",
            options: [
              { value: "new", label: "Brand new" },
              { value: "preloved", label: "Pre-loved" },
            ],
          },
        ]}
      />
      <DataTable<StaffProductRow>
        caption="Products"
        rows={rows}
        rowKey={(row) => row.id}
        href={(row) => `/admin/products/${row.id}`}
        empty={
          <EmptyState icon={Package} title={query.q || query.view || query.kind ? "No products match" : "No products yet"}>
            {query.q || query.view || query.kind ? "Try a different search or clear the filters." : "Add your first pair, or import a CSV."}
          </EmptyState>
        }
        columns={[
          {
            key: "title",
            header: "Product",
            render: (row) => (
              <span className="flex items-center gap-3">
                {row.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- small list thumbnail
                  <img src={row.image} alt="" width={40} height={40} className="size-10 shrink-0 rounded-sm bg-surface object-contain" />
                ) : (
                  <span aria-hidden className="size-10 shrink-0 rounded-sm bg-surface" />
                )}
                <span className="flex flex-col">
                  <span>{row.title}</span>
                  <span className="text-14 font-normal text-subtle-foreground">{row.brand}</span>
                </span>
              </span>
            ),
          },
          { key: "kind", header: "Type", hideBelow: "md", render: (row) => (row.kind === "preloved" ? "Pre-loved" : "Brand new") },
          { key: "status", header: "Status", render: (row) => <StatusPill tone={STATUS[row.status].tone}>{STATUS[row.status].label}</StatusPill> },
          { key: "sizes", header: "Sizes", align: "end", hideBelow: "lg", render: (row) => row.sizes },
          { key: "stock", header: "Stock", align: "end", hideBelow: "sm", render: (row) => (row.stock === 0 ? <StatusPill tone="danger">Out</StatusPill> : row.stock) },
          { key: "price", header: "From", align: "end", render: (row) => (row.price === null ? "—" : formatPrice(row.price)) },
        ]}
      />
      <Pagination basePath="/admin/products" params={raw} page={query.page} pageSize={pageSize} total={total} />
    </>
  )
}
