import { AdminShell } from "@/components/admin/admin-shell"
import { staffPage } from "@/server/admin/dal"

/**
 * Every shell page needs an AAL2 staff session; pages then check their own permission
 * (permissionPage). The layout's check alone isn't enough: layouts don't re-run on client
 * navigation, so each page checks again (A-006).
 */
export default async function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const staff = await staffPage()
  return (
    <AdminShell staff={{ displayName: staff.member.displayName || staff.member.email, email: staff.member.email, roles: staff.roles.map((role) => role.name), permissions: staff.permissions }}>
      {children}
    </AdminShell>
  )
}
