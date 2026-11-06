import { Package } from "lucide-react"
import type { Metadata } from "next"

import { adminButton } from "@/components/admin/button"
import { AdminCard } from "@/components/admin/card"
import { DataTable } from "@/components/admin/data-table"
import { DetailLayout } from "@/components/admin/detail-layout"
import { DiffViewer } from "@/components/admin/diff-viewer"
import { EmptyState } from "@/components/admin/empty-state"
import { FilterBar } from "@/components/admin/filter-bar"
import { PageHeader } from "@/components/admin/page-header"
import { Pagination } from "@/components/admin/pagination"
import { StatCard } from "@/components/admin/stat-card"
import { StatusPill } from "@/components/admin/status-pill"
import { Timeline } from "@/components/admin/timeline"
import { GalleryInteractive } from "@/features/admin/dev/gallery-interactive"
import { permissionPage } from "@/server/admin/dal"
import { permissionCatalog } from "@/server/admin/permissions"

export const metadata: Metadata = { title: "Component gallery" }

/** Representative shared admin components with sample data (admin-design.md). */
export default async function GalleryPage() {
  await permissionPage("dashboard:read", "/admin/dev/gallery")
  return (
    <>
      <PageHeader title="Component gallery" description="Sample data for the shared components. Filters update this page's URL; edits to the examples are discarded when you leave." crumbs={[{ label: "Dashboard", href: "/admin" }]} actions={<span className={adminButton({ tone: "primary", size: "sm" })}>Primary action</span>} />
      <AdminCard title="Buttons and status">
        <div className="flex flex-wrap gap-2">
          {(["primary", "secondary", "ghost", "danger"] as const).map((tone) => (
            <span key={tone} className={adminButton({ tone })}>
              {tone}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(["success", "pending", "danger", "neutral", "info"] as const).map((tone) => (
            <StatusPill key={tone} tone={tone}>
              {tone}
            </StatusPill>
          ))}
        </div>
      </AdminCard>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Net sales today" value="PKR 48,000" comparison="12% above the 7-day daily average" trend="up" />
        <StatCard label="Orders today" value={3} comparison="40% below the 7-day daily average" trend="down" />
        <StatCard label="Pairs sold" value={4} />
      </div>
      <AdminCard title="Filters and pagination">
        <FilterBar searchLabel="Search sample products" fields={[{ kind: "select", name: "status", label: "Status", options: [{ value: "live", label: "Live" }, { value: "draft", label: "Draft" }] }, { kind: "date", name: "from", label: "From" }]} />
        <Pagination basePath="/admin/dev/gallery" params={{}} page={1} pageSize={25} total={2} />
      </AdminCard>
      <AdminCard title="DataTable">
        <DataTable
          caption="Sample rows"
          rows={[
            { id: "a", name: "Nike Air Max 90", status: "Live", total: "PKR 14,999" },
            { id: "b", name: "ASICS Gel-Kayano 30", status: "Draft", total: "PKR 32,999" },
          ]}
          rowKey={(row) => row.id}
          columns={[
            { key: "name", header: "Product", render: (row) => row.name },
            { key: "status", header: "Status", render: (row) => <StatusPill tone={row.status === "Live" ? "success" : "pending"}>{row.status}</StatusPill> },
            { key: "total", header: "Price", align: "end", render: (row) => row.total },
          ]}
        />
      </AdminCard>
      <AdminCard title="EmptyState">
        <EmptyState icon={Package} title="No products yet">
          What the list is, and the first thing to do.
        </EmptyState>
      </AdminCard>
      <DetailLayout main={
        <AdminCard title="Timeline">
          <Timeline
            label="Sample history"
            events={[
              { id: "1", at: "2026-11-12T09:00:00Z", title: "Order placed", actor: "Guest checkout" },
              { id: "2", at: "2026-11-12T11:30:00Z", title: "To pack → Packing", actor: "Staff" },
            ]}
          />
        </AdminCard>
      } side={
        <AdminCard title="DiffViewer">
          <DiffViewer before={{ status: "draft", title: "Air Max" }} after={{ status: "active", title: "Air Max" }} />
        </AdminCard>
      } />
      <AdminCard title="Interactive">
        <GalleryInteractive catalog={permissionCatalog()} />
      </AdminCard>
    </>
  )
}
