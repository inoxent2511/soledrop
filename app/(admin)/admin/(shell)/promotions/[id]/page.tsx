import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AdminCard } from "@/components/admin/card"
import { PageHeader } from "@/components/admin/page-header"
import { PromotionEditor } from "@/features/admin/promotions/components/promotion-editor"
import { PromotionSwitch } from "@/features/admin/promotions/components/promotion-switch"
import { toDraft } from "@/features/admin/promotions/draft"
import { can, permissionPage } from "@/server/admin/dal"
import { staffCatalog } from "@/server/catalog"
import { staffPromotions } from "@/server/promotions"
import { isDomainError } from "@/server/shared/errors"

type Props = { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: "Promotion" }

export default async function PromotionPage({ params }: Props) {
  const { id } = await params
  const staff = await permissionPage("promotions:read", `/admin/promotions/${id}`)
  const { promotion, redemptions } = await staffPromotions()
    .detail(staff, id)
    .catch((error) => {
      if (isDomainError(error) && error.code === "not_found") notFound()
      throw error
    })
  const collections = staff.permissions.includes("collections:read") ? await staffCatalog().collections(staff) : []
  const canWrite = can(staff, "promotions:write")
  return (
    <>
      <PageHeader title={promotion.title} crumbs={[{ label: "Promotions", href: "/admin/promotions" }]} description={`Used ${promotion.timesUsed} time${promotion.timesUsed === 1 ? "" : "s"}.`} actions={canWrite ? <PromotionSwitch id={promotion.id} active={promotion.active} used={promotion.timesUsed > 0 || redemptions.length > 0} /> : null} />
      <PromotionEditor key={JSON.stringify(promotion)} initial={toDraft(promotion)} canWrite={canWrite} collections={collections.map((collection) => ({ slug: collection.slug, title: collection.title }))} />
      <AdminCard title="Recent redemptions">
        {redemptions.length === 0 ? <p className="text-16 text-subtle-foreground">Not used yet.</p> : null}
        <ul className="flex flex-col divide-y divide-border text-16">
          {redemptions.map((row, index) => (
            <li key={index} className="flex flex-wrap justify-between gap-2 py-2">
              <span>
                {row.order ? (
                  <Link href={`/admin/orders/${row.order}`} className="font-semibold underline underline-offset-4">
                    {row.order}
                  </Link>
                ) : (
                  "Order"
                )}{" "}
                · {row.email}
              </span>
              <span className="text-subtle-foreground">{new Date(row.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" })}</span>
            </li>
          ))}
        </ul>
      </AdminCard>
    </>
  )
}
