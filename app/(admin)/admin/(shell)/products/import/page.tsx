import type { Metadata } from "next"

import { AdminCard } from "@/components/admin/card"
import { PageHeader } from "@/components/admin/page-header"
import { ImportForm } from "@/features/admin/products/components/import-form"
import { permissionPage } from "@/server/admin/dal"
import { PRODUCT_COLUMNS } from "@/server/import-export"

export const metadata: Metadata = { title: "Import products" }

export default async function ImportProductsPage() {
  await permissionPage("products:import", "/admin/products/import")
  return (
    <>
      <PageHeader title="Import products" description="Add or update many products from a spreadsheet. Products match by slug, sizes by SKU; prices and stock are set from the file." crumbs={[{ label: "Products", href: "/admin/products" }]} />
      <AdminCard title="Upload">
        <ImportForm />
      </AdminCard>
      <AdminCard title="Columns" description="One row per size. Export the catalogue to get a file in this format.">
        <p className="font-mono text-14 break-words">{PRODUCT_COLUMNS.join(", ")}</p>
      </AdminCard>
    </>
  )
}
