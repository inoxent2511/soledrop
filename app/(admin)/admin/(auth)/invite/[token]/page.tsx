import type { Metadata } from "next"
import Link from "next/link"

import { AcceptInviteForm } from "@/features/admin/auth/components/auth-forms"
import { adminService } from "@/server/admin"

export const metadata: Metadata = { title: "Join the team", referrer: "no-referrer" }

export default async function AdminInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await adminService().peekInvite(token)
  if (!invite) {
    return (
      <>
        <h1 className="text-24 font-extrabold">This invite has expired</h1>
        <p className="text-16 text-subtle-foreground">Invite links work once and expire after a few days. Ask the person who invited you for a new one.</p>
        <Link href="/admin/login" className="text-16 font-semibold underline underline-offset-4">
          Go to staff sign in
        </Link>
      </>
    )
  }
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-24 font-extrabold">Join the Sole Drop team</h1>
        <p className="text-16 text-subtle-foreground">
          You&apos;ve been invited as <strong className="text-foreground">{invite.roleName}</strong>. Set your name and password, then turn on two-step verification.
        </p>
      </div>
      <AcceptInviteForm token={token} email={invite.email} />
    </>
  )
}
