import { FileText, Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { adminButton } from "@/components/admin/button"
import { AdminCard } from "@/components/admin/card"
import { DataTable } from "@/components/admin/data-table"
import { EmptyState } from "@/components/admin/empty-state"
import { PageHeader } from "@/components/admin/page-header"
import { StatusPill } from "@/components/admin/status-pill"
import { formatDate } from "@/lib/format"
import { can, permissionPage } from "@/server/admin/dal"
import { staffContent } from "@/server/content"

export const metadata: Metadata = { title: "Pages & FAQs" }

const POLICIES = [
  ["Terms & Conditions", "/terms"],
  ["Privacy Policy", "/privacy"],
  ["Shipping & Delivery Policy", "/shipping"],
  ["Returns, Exchanges & Refunds Policy", "/returns"],
] as const

export default async function AdminContentPage() {
  const staff = await permissionPage("content:read", "/admin/content")
  const pages = await staffContent().pages(staff)
  return (
    <>
      <PageHeader
        title="Pages & FAQs"
        description="Information pages built from blocks, and the questions on the FAQ page."
        actions={
          <>
            <Link href="/admin/content/home" className={adminButton({ tone: "secondary", size: "sm" })}>Homepage</Link>
            <Link href="/admin/content/faqs" className={adminButton({ tone: "secondary", size: "sm" })}>
              FAQs
            </Link>
            {can(staff, "content:write") ? (
              <Link href="/admin/content/pages/new" className={adminButton({ tone: "primary", size: "sm" })}>
                <Plus aria-hidden /> New page
              </Link>
            ) : null}
          </>
        }
      />
      <DataTable
        caption="Pages"
        rows={pages}
        rowKey={(page) => page.slug}
        href={(page) => `/admin/content/pages/${page.slug}`}
        empty={<EmptyState icon={FileText} title="No pages yet" />}
        columns={[
          { key: "title", header: "Page", render: (page) => page.title },
          { key: "slug", header: "Address", hideBelow: "md", render: (page) => <code className="text-14">/pages/{page.slug}</code> },
          { key: "status", header: "Status", render: (page) => <StatusPill tone={page.published ? "success" : "pending"}>{page.published ? "Published" : "Draft"}</StatusPill> },
          { key: "updated", header: "Updated", hideBelow: "sm", render: (page) => formatDate(page.updatedAt) },
        ]}
      />
      <AdminCard title="Policy pages" description="These are designed documents kept with the site's code (from the owner's policy PDFs), so legal wording changes go through a release, not this editor.">
        <ul className="flex flex-col gap-1 text-16">
          {POLICIES.map(([label, href]) => (
            <li key={href}>
              <Link href={href} target="_blank" className="underline underline-offset-4">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </AdminCard>
    </>
  )
}
