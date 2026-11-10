import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { adminButton } from "@/components/admin/button"
import { DataTable } from "@/components/admin/data-table"
import { PageHeader } from "@/components/admin/page-header"
import { StatusPill } from "@/components/admin/status-pill"
import { formatPrice } from "@/lib/format"
import { adminService } from "@/server/admin"
import { can, permissionPage } from "@/server/admin/dal"

export const metadata: Metadata = { title: "Roles" }

export default async function AdminRolesPage() {
  const staff = await permissionPage("staff:read", "/admin/staff/roles")
  const roles = await adminService().listRoles(staff)
  return (
    <>
      <PageHeader
        title="Roles"
        description="What each role can do. Built-in roles can't be changed; make a custom role for a different mix."
        crumbs={[{ label: "Staff & roles", href: "/admin/staff" }]}
        actions={
          can(staff, "roles:manage") ? (
            <Link prefetch={false} href="/admin/staff/roles/new" className={adminButton({ tone: "primary", size: "sm" })}>
              <Plus aria-hidden /> New role
            </Link>
          ) : null
        }
      />
      <DataTable
        caption="Roles"
        rows={roles}
        rowKey={(role) => role.key}
        href={(role) => `/admin/staff/roles/${role.key}`}
        columns={[
          { key: "name", header: "Role", render: (role) => role.name },
          { key: "type", header: "Type", render: (role) => (role.isSystem ? <StatusPill tone="neutral">Built-in</StatusPill> : <StatusPill tone="info">Custom</StatusPill>) },
          { key: "permissions", header: "Permissions", align: "end", render: (role) => role.permissions.length },
          { key: "refund", header: "Refund limit", align: "end", hideBelow: "md", render: (role) => (role.refundLimit === null ? "No limit" : role.refundLimit === 0 ? "—" : formatPrice(role.refundLimit)) },
          { key: "members", header: "People", align: "end", render: (role) => role.members },
        ]}
      />
    </>
  )
}
