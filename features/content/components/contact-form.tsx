"use client"

import { useId, useRef, useState, type FormEvent } from "react"

import { ApiError } from "@/api/http"
import { buttonVariants } from "@/components/ui/button-variants"
import { useContact } from "@/hooks/api/content/mutations"
import { cn } from "@/lib/utils"

const warmSchema = () => { void import("@/features/content/schemas/forms").catch(() => undefined) }

type Field = "name" | "email" | "orderNumber" | "message"

const fields: { name: Field; label: string; type?: string; autoComplete?: string; multiline?: boolean }[] = [
  { name: "name", label: "Full Name", autoComplete: "name" },
  { name: "email", label: "Email", type: "email", autoComplete: "email" },
  { name: "orderNumber", label: "Order Number (Optional)", autoComplete: "off" },
  { name: "message", label: "Message", multiline: true },
]

const control =
  "w-full rounded-lg border-2 border-control-border bg-background px-4 text-18 transition-colors hover:border-foreground focus-visible:border-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive"

/**
 * "Send a message" (screen 06). Validates on submit with the same schema the API uses, shows each
 * field's message under it and focuses the first invalid field; on success the form is replaced
 * by a confirmation that names the reply address.
 */
export function ContactForm() {
  const id = useId()
  const contact = useContact()
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>
    submitting.current = true
    setBusy(true)
    try {
      const { contactSchema } = await import("@/features/content/schemas/forms")
      const parsed = contactSchema.safeParse({ ...data, website: data.website || undefined })
      if (!parsed.success) {
        const next: Partial<Record<Field, string>> = {}
        for (const issue of parsed.error.issues) {
          const key = issue.path[0] as Field
          next[key] ??= issue.message
        }
        setErrors(next)
        const first = fields.find((field) => next[field.name])
        if (first) form.querySelector<HTMLElement>(`[name="${first.name}"]`)?.focus()
        return
      }
      setErrors({})
      setFormError(null)
      await contact.mutateAsync(parsed.data)
    } catch (failure) {
      if (failure instanceof ApiError && Object.keys(failure.fields).length) {
        setErrors(Object.fromEntries(Object.entries(failure.fields).map(([key, messages]) => [key, messages?.[0]])) as Partial<Record<Field, string>>)
      } else setFormError(failure instanceof ApiError ? failure.message : "Something went wrong. Please try again.")
    } finally { submitting.current = false; setBusy(false) }
  }

  if (contact.isSuccess) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-lg bg-surface px-6 py-8">
        <p className="text-24 font-extrabold uppercase">Message sent</p>
        <p className="text-18 text-subtle-foreground">Thanks — we&rsquo;ll reply to {contact.variables?.email} within one working day.</p>
      </div>
    )
  }

  return (
    <form noValidate onFocusCapture={warmSchema} onSubmit={onSubmit} aria-busy={busy || contact.isPending} className="flex flex-col gap-6 md:gap-10.5">
      {fields.map((field) => {
        const inputId = `${id}-${field.name}`
        const error = errors[field.name]
        const shared = {
          id: inputId,
          name: field.name,
          autoComplete: field.autoComplete,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": error ? `${inputId}-error` : undefined,
        }
        return (
          <div key={field.name} className="flex flex-col gap-2.5">
            <label htmlFor={inputId} className="text-18 font-bold md:text-20">
              {field.label}
            </label>
            {field.multiline ? (
              <textarea {...shared} rows={4} maxLength={2000} className={cn(control, "h-35 resize-y py-3")} />
            ) : (
              <input {...shared} type={field.type ?? "text"} className={cn(control, "h-14 md:h-15")} />
            )}
            {error ? (
              <p id={`${inputId}-error`} className="text-16 font-medium text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        )
      })}
      <div aria-hidden="true" className="hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="flex flex-col gap-3 md:pt-0.5">
        <button type="submit" disabled={busy || contact.isPending} className={cn(buttonVariants({ tone: "brand", size: "xl" }), "w-full rounded-lg border-2 border-stroke-soft md:h-19 3xl:h-19")}>
          {busy || contact.isPending ? "Sending…" : "Send message"}
        </button>
        {formError ? (
          <p role="alert" className="text-16 font-medium text-destructive">
            {formError}
          </p>
        ) : null}
      </div>
    </form>
  )
}
