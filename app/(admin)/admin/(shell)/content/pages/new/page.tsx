import type { Metadata } from "next"

import { PageHeader } from "@/components/admin/page-header"
import { PageEditor } from "@/features/admin/content/components/page-editor"
import { can, permissionPage } from "@/server/admin/dal"
import { staffContent } from "@/server/content"

export const metadata: Metadata = { title: "New page" }

export default async function NewContentPage() {
  const staff = await permissionPage("content:write", "/admin/content/pages/new")
  const categories = [...new Set((await staffContent().faqs(staff)).map((faq) => faq.category))]
  return (
    <>
      <PageHeader title="New page" crumbs={[{ label: "Pages & FAQs", href: "/admin/content" }]} />
      <PageEditor initial={null} faqCategories={categories} can={{ write: true, publish: can(staff, "content:publish") }} />
    </>
  )
}
