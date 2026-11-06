import type { Metadata } from "next"

import { AdminCard } from "@/components/admin/card"
import { PageHeader } from "@/components/admin/page-header"
import { PasswordPanel, RecoveryCodesPanel, SessionsPanel } from "@/features/admin/account/components/account-panels"
import { staffPage } from "@/server/admin/dal"

export const metadata: Metadata = { title: "Your account" }

/** Every staff member's own account: no permission beyond being signed in. */
export default async function AdminAccountPage() {
  const staff = await staffPage("/admin/account")
  return (
    <>
      <PageHeader title="Your account" crumbs={[{ label: "Dashboard", href: "/admin" }]} />
      <AdminCard title="Profile">
        <dl className="grid gap-3 text-16 sm:grid-cols-3">
          <div>
            <dt className="text-14 text-subtle-foreground">Name</dt>
            <dd className="font-semibold">{staff.member.displayName}</dd>
          </div>
          <div>
            <dt className="text-14 text-subtle-foreground">Email</dt>
            <dd className="font-semibold break-all">{staff.member.email}</dd>
          </div>
          <div>
            <dt className="text-14 text-subtle-foreground">Roles</dt>
            <dd className="font-semibold">{staff.roles.map((role) => role.name).join(", ")}</dd>
          </div>
        </dl>
      </AdminCard>
      <SessionsPanel />
      <div className="grid gap-6 xl:grid-cols-2">
        <PasswordPanel />
        <RecoveryCodesPanel />
      </div>
    </>
  )
}
