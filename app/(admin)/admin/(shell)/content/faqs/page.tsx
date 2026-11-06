import type { Metadata } from "next"

import { PageHeader } from "@/components/admin/page-header"
import { FaqManager } from "@/features/admin/content/components/faq-manager"
import { can, permissionPage } from "@/server/admin/dal"
import { staffContent } from "@/server/content"

export const metadata: Metadata = { title: "FAQs" }

export default async function AdminFaqsPage() {
  const staff = await permissionPage("content:read", "/admin/content/faqs")
  const faqs = await staffContent().faqs(staff)
  return (
    <>
      <PageHeader title="FAQs" description="The questions on the storefront's FAQ page, in their groups and order." crumbs={[{ label: "Pages & FAQs", href: "/admin/content" }]} />
      <FaqManager faqs={faqs} canEdit={can(staff, "content:publish")} />
    </>
  )
}
