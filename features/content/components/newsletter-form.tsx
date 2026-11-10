"use client"

import { useId, useRef, useState, type FormEvent } from "react"

import { ApiError } from "@/api/http"
import { buttonVariants } from "@/components/ui/button-variants"
import { useSubscribe } from "@/hooks/api/content/mutations"
import { useHydrated } from "@/hooks/use-hydrated"
import { cn } from "@/lib/utils"

const warmSchema = () => { void import("@/features/content/schemas/forms").catch(() => undefined) }

/**
 * "Stay in the drop" sign-up. Validates on submit, then reports the result in place: the field
 * error, a success line, or the server's message (rate limit, offline). Double opt-in is not
 * required for Pakistan; consent time is recorded server-side (docs/app/journey-audit.md J-14).
 */
export function NewsletterForm({ source = "footer" }: { source?: string }) {
  const id = useId()
  const hydrated = useHydrated()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const subscribe = useSubscribe()
  const done = subscribe.isSuccess

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    const data = new FormData(event.currentTarget)
    submitting.current = true
    setBusy(true)
    try {
      const { newsletterSchema } = await import("@/features/content/schemas/forms")
      const parsed = newsletterSchema.safeParse({ email: data.get("email"), source, website: data.get("website") || undefined })
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Enter a valid email address")
        return
      }
      setError(null)
      await subscribe.mutateAsync(parsed.data)
    } catch (failure) {
      setError(failure instanceof ApiError ? (failure.fields.email?.[0] ?? failure.message) : "Something went wrong. Please try again.")
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  const message = error ?? (done ? (subscribe.data.created ? "You're in. Watch your inbox for the next drop." : "You're already on the list — see you at the next drop.") : null)

  return (
    <form method="post" noValidate onFocusCapture={warmSchema} onSubmit={onSubmit} className="flex w-full max-w-178.5 flex-col items-center gap-3">
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:gap-3.5">
        <label htmlFor={`${id}-email`} className="sr-only">
          Email address
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="Enter your email address"
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? `${id}-status` : undefined}
          disabled={done}
          className="h-14 min-w-0 flex-1 border border-border-strong bg-ink-field px-5.5 text-18 font-medium text-background placeholder:text-muted-foreground aria-invalid:border-destructive md:h-17 md:text-20"
        />
        <input name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="sr-only" />
        <button
          type="submit"
          disabled={!hydrated || busy || subscribe.isPending || done}
          className={cn(buttonVariants({ tone: "brand-on-ink", size: "md" }), "h-14 md:h-17 sm:w-40")}
        >
          {busy || subscribe.isPending ? "Joining…" : done ? "Joined" : "Join now"}
        </button>
      </div>
      <p id={`${id}-status`} role="status" aria-live="polite" className={cn("min-h-5.5 text-16 font-medium", error ? "text-background" : "text-brand")}>
        {error ? <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full bg-destructive" />{error}</span> : message}
      </p>
    </form>
  )
}
