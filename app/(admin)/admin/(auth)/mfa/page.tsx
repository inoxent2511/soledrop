import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { safeNext } from "@/features/admin/auth/schemas"
import { VerifyCodeForm } from "@/features/admin/auth/components/auth-forms"
import { currentStaff } from "@/server/admin/dal"

export const metadata: Metadata = { title: "Two-step verification" }

export default async function AdminMfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next)
  const staff = await currentStaff()
  if (!staff) redirect(`/admin/login?next=${encodeURIComponent(next)}`)
  if (staff.session.aal === 2) redirect(next)
  if (!staff.member.totpEnabledAt) redirect(`/admin/mfa/setup?next=${encodeURIComponent(next)}`)
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-24 font-extrabold">Two-step verification</h1>
        <p className="text-16 text-subtle-foreground">Enter the 6-digit code from your authenticator app.</p>
      </div>
      <VerifyCodeForm next={next} />
    </>
  )
}
