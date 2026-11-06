import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { safeNext } from "@/features/admin/auth/schemas"
import { StaffLoginForm } from "@/features/admin/auth/components/auth-forms"
import { currentStaff } from "@/server/admin/dal"

export const metadata: Metadata = { title: "Sign in" }

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next)
  const staff = await currentStaff()
  if (staff?.session.aal === 2) redirect(next)
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-24 font-extrabold">Staff sign in</h1>
        <p className="text-16 text-subtle-foreground">For the Sole Drop team. Shoppers sign in on the store.</p>
      </div>
      <StaffLoginForm next={next} />
    </>
  )
}
