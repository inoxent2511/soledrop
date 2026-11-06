import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PageHeader } from "@/components/admin/page-header"
import { PageEditor } from "@/features/admin/content/components/page-editor"
import { can, permissionPage } from "@/server/admin/dal"
import { staffContent } from "@/server/content"
import { isDomainError } from "@/server/shared/errors"

type Props = { params: Promise<{ slug: string }> }

export const metadata: Metadata = { title: "Edit page" }

export default async function EditContentPage({ params }: Props) {
  const { slug } = await params
  const staff = await permissionPage("content:read", `/admin/content/pages/${slug}`)
  const service = staffContent()
  const page = await service.page(staff, slug).catch((error) => {
    if (isDomainError(error) && error.code === "not_found") notFound()
    throw error
  })
  const categories = [...new Set((await service.faqs(staff)).map((faq) => faq.category))]
  return (
    <>
      <PageHeader title={page.title} crumbs={[{ label: "Pages & FAQs", href: "/admin/content" }]} />
      <PageEditor key={page.updatedAt + String(page.published)} initial={page} faqCategories={categories} can={{ write: can(staff, "content:write"), publish: can(staff, "content:publish") }} />
    </>
  )
}
