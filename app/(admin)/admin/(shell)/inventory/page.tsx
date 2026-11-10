import { Boxes } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { z } from "zod"

import { DataTable } from "@/components/admin/data-table"
import { EmptyState } from "@/components/admin/empty-state"
import { FilterBar } from "@/components/admin/filter-bar"
import { PageHeader } from "@/components/admin/page-header"
import { Pagination } from "@/components/admin/pagination"
import { StatusPill } from "@/components/admin/status-pill"
import { AdjustStock } from "@/features/admin/inventory/components/adjust-stock"
import { can, permissionPage } from "@/server/admin/dal"
import { staffCatalog } from "@/server/catalog"

export const metadata: Metadata = { title: "Inventory" }

const params = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  view: z.enum(["low", "out"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
})

export default async function AdminInventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await permissionPage("inventory:read", "/admin/inventory")
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))
  const query = params.parse({ page: 1, ...raw })
  const pageSize = 50
  const { rows, total } = await staffCatalog().stock(staff, { q: query.q, low: query.view === "low" ? 2 : query.view === "out" ? 0 : undefined, page: query.page, pageSize })
  const canAdjust = can(staff, "inventory:adjust")
  const canSeeProducts = can(staff, "products:read")

  return (
    <>
      <PageHeader title="Inventory" description="Stock per size. “Held” is in shoppers' bags right now; “Available” is what can still be bought." />
      <FilterBar
        searchLabel="Search by product or SKU"
        fields={[]}
        views={[
          { key: "all", label: "All sizes" },
          { key: "low", label: "Low (2 or fewer)" },
          { key: "out", label: "Sold out" },
        ]}
      />
      <DataTable
        caption="Stock levels"
        rows={rows}
        rowKey={(row) => row.variantId}
        empty={<EmptyState icon={Boxes} title="Nothing here">{query.view ? "No sizes are this low. Nice." : "Add products to see their stock."}</EmptyState>}
        columns={[
          {
            key: "product",
            header: "Product",
            render: (row) =>
              canSeeProducts ? (
                <Link prefetch={false} href={`/admin/products/${row.productId}`} className="font-semibold underline-offset-4 hover:underline">
                  {row.title}
                </Link>
              ) : (
                row.title
              ),
          },
          { key: "size", header: "Size", render: (row) => `UK ${row.size.uk} · EU ${row.size.eu}` },
          { key: "sku", header: "SKU", hideBelow: "md", render: (row) => <code className="text-14">{row.sku}</code> },
          { key: "onHand", header: "On hand", align: "end", render: (row) => row.onHand },
          { key: "held", header: "Held", align: "end", hideBelow: "sm", render: (row) => row.reserved },
          { key: "available", header: "Available", align: "end", render: (row) => (row.available <= 0 ? <StatusPill tone="danger">0</StatusPill> : row.available <= 2 ? <StatusPill tone="pending">{row.available}</StatusPill> : row.available) },
          { key: "actions", header: "", align: "end", render: (row) => <AdjustStock variantId={row.variantId} label={`${row.title} · UK ${row.size.uk}`} onHand={row.onHand} reserved={row.reserved} canAdjust={canAdjust} /> },
        ]}
      />
      <Pagination basePath="/admin/inventory" params={raw} page={query.page} pageSize={pageSize} total={total} />
    </>
  )
}
