import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { AdminCard } from "@/components/admin/card"
import { DetailLayout } from "@/components/admin/detail-layout"
import { PageHeader } from "@/components/admin/page-header"
import { StatusPill } from "@/components/admin/status-pill"
import { MemberActions } from "@/features/admin/staff/components/member-actions"
import { adminService } from "@/server/admin"
import { can, permissionPage } from "@/server/admin/dal"
import { isDomainError } from "@/server/shared/errors"

type Props = { params: Promise<{ userId: string }> }

export const metadata: Metadata = { title: "Staff member" }

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" })

export default async function StaffMemberPage({ params }: Props) {
  const { userId } = await params
  const staff = await permissionPage("staff:read", `/admin/staff/${userId}`)
  const service = adminService()
  const member = await service.getStaff(staff, userId).catch((error) => {
    if (isDomainError(error) && error.code === "not_found") notFound()
    throw error
  })
  const [sessions, roles] = await Promise.all([service.listSessions(staff, userId), service.listRoles(staff)])
  return (
    <>
      <PageHeader
        title={member.displayName || member.email}
        crumbs={[{ label: "Staff & roles", href: "/admin/staff" }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill tone={member.status === "active" ? "success" : member.status === "suspended" ? "danger" : "pending"}>{member.status}</StatusPill>
            <span>{member.email}</span>
            {member.locked ? <StatusPill tone="danger">Locked after failed sign-ins</StatusPill> : null}
          </span>
        }
      />
      <DetailLayout
        main={
          <AdminCard title="Signed in on" description="Sessions end after 30 minutes idle or 12 hours in all.">
            {sessions.length === 0 ? <p className="text-16 text-subtle-foreground">Not signed in anywhere.</p> : null}
            <ul className="flex flex-col divide-y divide-border text-16">
              {sessions.map((session) => (
                <li key={session.id} className="flex flex-col gap-0.5 py-2">
                  <span>{session.userAgent ?? "Unknown device"}</span>
                  <span className="text-14 text-subtle-foreground">
                    {session.ip ?? "Unknown address"} · since {when(session.createdAt)} · last active {when(session.lastSeenAt)}
                  </span>
                </li>
              ))}
            </ul>
          </AdminCard>
        }
        side={
          <AdminCard title="Access">
            {can(staff, "staff:manage") ? (
              <MemberActions userId={member.userId} email={member.email} status={member.status} roles={member.roles.map((role) => role.key)} allRoles={roles.map((role) => ({ key: role.key, name: role.name }))} self={member.userId === staff.member.userId} />
            ) : (
              <p className="text-16">{member.roles.map((role) => role.name).join(", ")}</p>
            )}
          </AdminCard>
        }
      />
    </>
  )
}
