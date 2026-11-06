import type { Metadata } from "next"
import Link from "next/link"

import { adminButton } from "@/components/admin/button"
import { EmptyState } from "@/components/admin/empty-state"
import { ADMIN_MODULES } from "@/features/admin/modules"
import { isPermission, PERMISSIONS } from "@/server/admin/permissions"
import { staffPage } from "@/server/admin/dal"

export const metadata: Metadata = { title: "No access" }

/** The 403 page: says which permission is missing and who can grant it. */
export default async function AdminNoAccessPage({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  await staffPage("/admin/no-access")
  const need = (await searchParams).need ?? ""
  const permission = isPermission(need) ? need : null
  const area = permission ? ADMIN_MODULES.find((entry) => entry.permission === permission) : undefined
  return (
    <EmptyState title="You don't have access to this page" action={<Link href="/admin" className={adminButton({ tone: "secondary" })}>Back to the dashboard</Link>}>
      {permission ? (
        <p>
          {area ? `${area.label} needs` : "This needs"} the <strong className="text-foreground">{PERMISSIONS[permission].label}</strong> permission (<code>{permission}</code>). Ask an Owner or Admin to add it to one of your roles.
        </p>
      ) : (
        <p>Ask an Owner or Admin for the permission you need.</p>
      )}
    </EmptyState>
  )
}
