import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { safeNext } from "@/features/admin/auth/schemas"
import { EnrolForm } from "@/features/admin/auth/components/auth-forms"
import { currentStaff } from "@/server/admin/dal"

export const metadata: Metadata = { title: "Set up two-step verification" }

/** Mandatory MFA enrolment (A-002): an AAL1 session without MFA can reach nothing else. */
export default async function AdminMfaSetupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next)
  const staff = await currentStaff()
  if (!staff) redirect(`/admin/login?next=${encodeURIComponent(next)}`)
  if (staff.member.totpEnabledAt) redirect(staff.session.aal === 2 ? next : `/admin/mfa?next=${encodeURIComponent(next)}`)
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-24 font-extrabold">Set up two-step verification</h1>
        <p className="text-16 text-subtle-foreground">Every staff account needs a second step at sign-in. It takes a minute.</p>
      </div>
      <EnrolForm next={next} />
    </>
  )
}
