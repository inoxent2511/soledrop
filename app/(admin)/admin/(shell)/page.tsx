import type { Metadata } from "next"
import Link from "next/link"

import { AdminCard } from "@/components/admin/card"
import { PageHeader } from "@/components/admin/page-header"
import { visibleModules } from "@/features/admin/modules"
import { permissionPage } from "@/server/admin/dal"

export const metadata: Metadata = { title: "Dashboard" }

export default async function AdminDashboardPage() {
  const staff = await permissionPage("dashboard:read", "/admin")
  const modules = visibleModules(staff.permissions).filter((module) => module.key !== "dashboard")
  return (
    <>
      <PageHeader title={`Hello, ${staff.member.displayName || staff.member.email}`} description={`Signed in as ${staff.roles.map((role) => role.name).join(", ")}.`} />
      <AdminCard title="Where to next">
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => {
            const Icon = module.icon
            return (
              <li key={module.key}>
                <Link href={module.href} className="flex h-14 items-center gap-3 rounded-md border border-border px-4 text-16 font-semibold transition-colors hover:border-foreground">
                  <Icon aria-hidden className="size-5" />
                  {module.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </AdminCard>
    </>
  )
}
