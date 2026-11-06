import { ShieldCheck } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { adminButton } from "@/components/admin/button"
import { AdminCard } from "@/components/admin/card"
import { DataTable } from "@/components/admin/data-table"
import { PageHeader } from "@/components/admin/page-header"
import { StatusPill } from "@/components/admin/status-pill"
import { InviteStaff } from "@/features/admin/staff/components/invite-staff"
import { formatDate } from "@/lib/format"
import { adminService } from "@/server/admin"
import { can, permissionPage } from "@/server/admin/dal"

export const metadata: Metadata = { title: "Staff & roles" }

const STATUS = { active: { label: "Active", tone: "success" }, suspended: { label: "Suspended", tone: "danger" }, invited: { label: "Invited", tone: "pending" } } as const
const INVITE = { pending: "pending", accepted: "success", revoked: "neutral", expired: "neutral" } as const

export default async function AdminStaffPage() {
  const staff = await permissionPage("staff:read", "/admin/staff")
  const service = adminService()
  const [members, invites, roles] = await Promise.all([service.listStaff(staff), service.listInvites(staff), service.listRoles(staff)])
  const canManage = can(staff, "staff:manage")
  return (
    <>
      <PageHeader
        title="Staff & roles"
        description="Who can sign in to the admin and what each person can do. Everyone uses two-step verification."
        actions={
          <>
            <Link href="/admin/staff/roles" className={adminButton({ tone: "secondary", size: "sm" })}>
              <ShieldCheck aria-hidden /> Roles
            </Link>
            {canManage ? <InviteStaff roles={roles.map((role) => ({ key: role.key, name: role.name }))} /> : null}
          </>
        }
      />
      <DataTable
        caption="Staff"
        rows={members}
        rowKey={(member) => member.userId}
        href={(member) => `/admin/staff/${member.userId}`}
        columns={[
          { key: "name", header: "Name", render: (member) => member.displayName || member.email },
          { key: "email", header: "Email", hideBelow: "md", render: (member) => member.email },
          { key: "roles", header: "Roles", render: (member) => member.roles.map((role) => role.name).join(", ") || "—" },
          { key: "status", header: "Status", render: (member) => <StatusPill tone={STATUS[member.status].tone}>{STATUS[member.status].label}</StatusPill> },
          { key: "mfa", header: "Two-step", hideBelow: "sm", render: (member) => (member.mfa ? "On" : <StatusPill tone="pending">Not set up</StatusPill>) },
          { key: "seen", header: "Last active", hideBelow: "lg", render: (member) => (member.lastSeenAt ? formatDate(member.lastSeenAt) : "—") },
        ]}
      />
      {invites.length ? (
        <AdminCard title="Invites">
          <ul className="flex flex-col divide-y divide-border text-16">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {invite.email} · {roles.find((role) => role.key === invite.roleKey)?.name ?? invite.roleKey}
                </span>
                <span className="flex items-center gap-2 text-14 text-subtle-foreground">
                  <StatusPill tone={INVITE[invite.state]}>{invite.state}</StatusPill> sent {formatDate(invite.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </AdminCard>
      ) : null}
    </>
  )
}
