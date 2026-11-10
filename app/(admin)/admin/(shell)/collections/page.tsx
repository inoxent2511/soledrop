import { FolderTree, Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { adminButton } from "@/components/admin/button"
import { DataTable } from "@/components/admin/data-table"
import { EmptyState } from "@/components/admin/empty-state"
import { PageHeader } from "@/components/admin/page-header"
import { StatusPill } from "@/components/admin/status-pill"
import { can, permissionPage } from "@/server/admin/dal"
import { staffCatalog } from "@/server/catalog"

export const metadata: Metadata = { title: "Collections" }

export default async function AdminCollectionsPage() {
  const staff = await permissionPage("collections:read", "/admin/collections")
  const collections = await staffCatalog().collections(staff)
  return (
    <>
      <PageHeader
        title="Collections"
        description="Groups of products with their own page: picked by hand, or matched by rules."
        actions={
          can(staff, "collections:write") ? (
            <Link prefetch={false} href="/admin/collections/new" className={adminButton({ tone: "primary", size: "sm" })}>
              <Plus aria-hidden /> New collection
            </Link>
          ) : null
        }
      />
      <DataTable
        caption="Collections"
        rows={collections}
        rowKey={(collection) => collection.id}
        href={(collection) => `/admin/collections/${collection.id}`}
        empty={<EmptyState icon={FolderTree} title="No collections yet" />}
        columns={[
          { key: "title", header: "Collection", render: (collection) => collection.title },
          { key: "slug", header: "Address", hideBelow: "md", render: (collection) => <code className="text-14">/collections/{collection.slug}</code> },
          { key: "kind", header: "Products", render: (collection) => (collection.kind === "rule" ? <StatusPill tone="info">By rules</StatusPill> : `${collection.products} picked`) },
        ]}
      />
    </>
  )
}
