import type { Metadata } from "next"

import { PageHeader } from "@/components/admin/page-header"
import { BrandsManager } from "@/features/admin/products/components/brands-manager"
import { can, permissionPage } from "@/server/admin/dal"
import { staffCatalog } from "@/server/catalog"

export const metadata: Metadata = { title: "Brands" }

export default async function BrandsPage() {
  const staff = await permissionPage("products:read", "/admin/brands")
  const brands = await staffCatalog().brands(staff)
  return <>
    <PageHeader title="Brands" description="Manage the brands shown in the product editor and storefront." crumbs={[{ label: "Products", href: "/admin/products" }]} />
    <BrandsManager initial={brands} canWrite={can(staff, "products:write")} />
  </>
}
