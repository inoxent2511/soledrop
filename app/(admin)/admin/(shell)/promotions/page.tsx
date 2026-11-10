import { Plus, Tag } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { adminButton } from "@/components/admin/button"
import { DataTable } from "@/components/admin/data-table"
import { EmptyState } from "@/components/admin/empty-state"
import { PageHeader } from "@/components/admin/page-header"
import { StatusPill } from "@/components/admin/status-pill"
import { describe } from "@/features/admin/promotions/draft"
import { can, permissionPage } from "@/server/admin/dal"
import { staffPromotions } from "@/server/promotions"

export const metadata: Metadata = { title: "Promotions" }

const STATE = { live: { label: "Live", tone: "success" }, scheduled: { label: "Scheduled", tone: "pending" }, ended: { label: "Ended", tone: "neutral" }, off: { label: "Off", tone: "neutral" }, used_up: { label: "Used up", tone: "neutral" } } as const

export default async function AdminPromotionsPage() {
  const staff = await permissionPage("promotions:read", "/admin/promotions")
  const promotions = await staffPromotions().list(staff)
  return (
    <>
      <PageHeader
        title="Promotions"
        description="Discount codes and automatic offers. Test one on a sample bag before switching it on."
        actions={
          can(staff, "promotions:write") ? (
            <Link prefetch={false} href="/admin/promotions/new" className={adminButton({ tone: "primary", size: "sm" })}>
              <Plus aria-hidden /> New promotion
            </Link>
          ) : null
        }
      />
      <DataTable
        caption="Promotions"
        rows={promotions}
        rowKey={(promotion) => promotion.id}
        href={(promotion) => `/admin/promotions/${promotion.id}`}
        empty={<EmptyState icon={Tag} title="No promotions yet" />}
        columns={[
          { key: "title", header: "Promotion", render: (promotion) => promotion.title },
          { key: "code", header: "Code", render: (promotion) => (promotion.code ? <code className="text-14">{promotion.code}</code> : <span className="text-14 text-subtle-foreground">Automatic</span>) },
          { key: "gives", header: "Gives", hideBelow: "md", render: (promotion) => describe(promotion) },
          { key: "state", header: "Status", render: (promotion) => <StatusPill tone={STATE[promotion.state].tone}>{STATE[promotion.state].label}</StatusPill> },
          { key: "used", header: "Used", align: "end", render: (promotion) => (promotion.usageLimit ? `${promotion.timesUsed} / ${promotion.usageLimit}` : promotion.timesUsed) },
        ]}
      />
    </>
  )
}
