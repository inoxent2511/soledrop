import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PageHeader } from "@/components/admin/page-header"
import { RoleEditor } from "@/features/admin/staff/components/role-editor"
import { adminService } from "@/server/admin"
import { can, permissionPage } from "@/server/admin/dal"
import { ALL_PERMISSIONS, OWNER_ROLE_KEY, permissionCatalog } from "@/server/admin/permissions"

type Props = { params: Promise<{ key: string }> }

export const metadata: Metadata = { title: "Role" }

/** `/admin/staff/roles/new` creates a custom role; any other key shows that role. */
export default async function RolePage({ params }: Props) {
  const { key } = await params
  const staff = await permissionPage("staff:read", `/admin/staff/roles/${key}`)
  const roles = await adminService().listRoles(staff)
  const role = key === "new" ? null : roles.find((entry) => entry.key === key)
  if (key !== "new" && !role) notFound()
  const isOwner = staff.roles.some((entry) => entry.key === OWNER_ROLE_KEY)
  return (
    <>
      <PageHeader title={role ? role.name : "New role"} crumbs={[{ label: "Staff & roles", href: "/admin/staff" }, { label: "Roles", href: "/admin/staff/roles" }]} />
      <RoleEditor
        key={role?.updatedAt ?? "new"}
        catalog={permissionCatalog()}
        canManage={can(staff, "roles:manage")}
        grantable={isOwner ? ALL_PERMISSIONS : staff.permissions}
        role={role ? { key: role.key, name: role.name, description: role.description, refundLimit: role.refundLimit, permissions: role.permissions, isSystem: role.isSystem, updatedAt: role.updatedAt } : { name: "", description: "", refundLimit: 0, permissions: ["dashboard:read"], isSystem: false }}
      />
    </>
  )
}
