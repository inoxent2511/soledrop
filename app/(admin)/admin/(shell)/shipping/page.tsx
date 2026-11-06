import type { Metadata } from "next"

import { PageHeader } from "@/components/admin/page-header"
import { ShippingEditor } from "@/features/admin/shipping/components/shipping-editor"
import { can, permissionPage } from "@/server/admin/dal"
import { staffShipping } from "@/server/shipping"

export const metadata: Metadata = { title: "Shipping & tax" }

export default async function AdminShippingPage() {
  const staff = await permissionPage("shipping:read", "/admin/shipping")
  const { zones, taxRates } = await staffShipping().overview(staff)
  return (
    <>
      <PageHeader title="Shipping & tax" description="Where you deliver, what it costs, when it's free, and the tax worked out for invoices." />
      <ShippingEditor zones={zones} taxRates={taxRates} canWrite={can(staff, "shipping:write")} />
    </>
  )
}
