"use client"

import { useRouter } from "next/navigation"
import { useId, useState, type FormEvent } from "react"

import { ApiError } from "@/api/http"
import { buttonVariants } from "@/components/ui/button-variants"
import { orderLookupSchema } from "@/features/checkout/schemas/checkout"
import { useOrderLookup } from "@/hooks/api/checkout/mutations"
import { useHydrated } from "@/hooks/use-hydrated"
import { cn } from "@/lib/utils"

type Field = "number" | "email"

const control =
  "h-14 w-full rounded-lg border-2 border-control-border bg-background px-4 text-18 transition-colors hover:border-foreground focus-visible:border-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive md:h-15"

/** Order number + checkout email → the order's private page. One message for any mismatch (no enumeration). */
export function OrderLookupForm() {
  const id = useId()
  const hydrated = useHydrated()
  const router = useRouter()
  const lookup = useOrderLookup()
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const parsed = orderLookupSchema.safeParse(Object.fromEntries(new FormData(form)))
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {}
      for (const issue of parsed.error.issues) next[issue.path[0] as Field] ??= issue.message
      setErrors(next)
      form.querySelector<HTMLElement>(`[name="${next.number ? "number" : "email"}"]`)?.focus()
      return
    }
    setErrors({})
    setFormError(null)
    lookup.mutate(parsed.data, {
      onSuccess: ({ number, token }) => router.push(`/orders/${number}?token=${encodeURIComponent(token)}`),
      onError: (failure) => setFormError(failure instanceof ApiError ? failure.message : "Something went wrong. Please try again."),
    })
  }

  const fields: { name: Field; label: string; type: string; autoComplete: string; hint?: string }[] = [
    { name: "number", label: "Order number", type: "text", autoComplete: "off", hint: "Like SD10001" },
    { name: "email", label: "Email used at checkout", type: "email", autoComplete: "email" },
  ]

  return (
    <form method="post" noValidate onSubmit={onSubmit} aria-busy={!hydrated || lookup.isPending} className="flex flex-col gap-6 md:gap-8">
      {fields.map((field) => {
        const inputId = `${id}-${field.name}`
        const error = errors[field.name]
        const describedBy = [field.hint ? `${inputId}-hint` : null, error ? `${inputId}-error` : null].filter(Boolean).join(" ") || undefined
        return (
          <div key={field.name} className="flex flex-col gap-2.5">
            <label htmlFor={inputId} className="text-18 font-bold md:text-20">
              {field.label}
            </label>
            {field.hint ? (
              <p id={`${inputId}-hint`} className="text-16 text-subtle-foreground">
                {field.hint}
              </p>
            ) : null}
            <input
              id={inputId}
              name={field.name}
              type={field.type}
              autoComplete={field.autoComplete}
              autoCapitalize={field.name === "number" ? "characters" : undefined}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              className={cn(control, field.name === "number" && "uppercase")}
            />
            {error ? (
              <p id={`${inputId}-error`} className="text-16 font-medium text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        )
      })}
      <button type="submit" disabled={!hydrated || lookup.isPending} className={cn(buttonVariants({ tone: "ink-light", size: "lg" }), "w-full 3xl:h-18")}>
        {lookup.isPending ? "Finding…" : "Find my order"}
      </button>
      <p role="alert" className="text-16 font-medium text-destructive empty:hidden">
        {formError}
      </p>
    </form>
  )
}
