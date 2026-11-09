"use client"

import Link from "next/link"
import { useMutation } from "@tanstack/react-query"

import { request } from "@/api/http"
import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"

/**
 * Unsubscribing takes one press, never just opening the link: mail scanners open links, and an
 * address shouldn't be dropped because a security filter previewed the email.
 */
export function UnsubscribeConfirm({ email, token }: { email: string; token: string }) {
  const unsubscribe = useMutation({ mutationFn: () => request<{ ok: boolean }>("/api/newsletter", { method: "DELETE", body: { email, token } }) })

  if (unsubscribe.isSuccess) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <p className="text-24 font-bold">You&rsquo;re unsubscribed</p>
        <p className="text-18 text-subtle-foreground">{email} won&rsquo;t get any more newsletters from us. Order emails still arrive as usual.</p>
        <Link href="/" className="text-18 font-semibold underline underline-offset-4">
          Back to the shop
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-18 text-subtle-foreground md:text-20">
        Stop newsletters to <strong className="font-semibold text-foreground">{email}</strong>? You can sign up again any time.
      </p>
      <button type="button" disabled={unsubscribe.isPending} onClick={() => unsubscribe.mutate()} className={cn(buttonVariants({ tone: "ink-light", size: "lg" }), "w-full 3xl:h-18")}>
        {unsubscribe.isPending ? "Unsubscribing…" : "Unsubscribe"}
      </button>
      <p role="alert" className="text-16 font-medium text-destructive empty:hidden">
        {unsubscribe.isError ? "This link has expired or is incomplete. Reply to any newsletter and we’ll remove you by hand." : null}
      </p>
    </div>
  )
}
