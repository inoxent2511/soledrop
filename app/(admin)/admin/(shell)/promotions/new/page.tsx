import type { Metadata } from "next"

import { PageHeader } from "@/components/admin/page-header"
import { PromotionEditor } from "@/features/admin/promotions/components/promotion-editor"
import { blankDraft } from "@/features/admin/promotions/draft"
import { permissionPage } from "@/server/admin/dal"
import { staffCatalog } from "@/server/catalog"

export const metadata: Metadata = { title: "New promotion" }

export default async function NewPromotionPage() {
  const staff = await permissionPage("promotions:write", "/admin/promotions/new")
  const collections = staff.permissions.includes("collections:read") ? await staffCatalog().collections(staff) : []
  return (
    <>
      <PageHeader title="New promotion" crumbs={[{ label: "Promotions", href: "/admin/promotions" }]} />
      <PromotionEditor initial={blankDraft} canWrite collections={collections.map((collection) => ({ slug: collection.slug, title: collection.title }))} />
    </>
  )
}
