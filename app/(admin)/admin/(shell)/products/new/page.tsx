import type { Metadata } from "next"

import { PageHeader } from "@/components/admin/page-header"
import { ProductEditor } from "@/features/admin/products/components/product-editor"
import { editorProps } from "@/features/admin/products/editor-data"
import { permissionPage } from "@/server/admin/dal"

export const metadata: Metadata = { title: "New product" }

export default async function NewProductPage() {
  const staff = await permissionPage("products:write", "/admin/products/new")
  return (
    <>
      <PageHeader title="New product" description="It starts as a draft; publish it once it has photos, sizes and prices." crumbs={[{ label: "Products", href: "/admin/products" }]} />
      <ProductEditor {...await editorProps(staff, null)} />
    </>
  )
}
