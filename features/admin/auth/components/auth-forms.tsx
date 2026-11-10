"use client"

import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState, type FormEvent } from "react"

import { adminAuthApi, type SignInNext } from "@/api/admin/auth"
import { adminButton } from "@/components/admin/button"
import { AdminField, FormAlert } from "@/components/admin/form"
import { useSchemaForm } from "@/features/account/components/form-field"
import { acceptInviteSchema, codeSchema, staffLoginSchema } from "@/features/admin/auth/schemas"
import { cn } from "@/lib/utils"
import { useHydrated } from "@/hooks/use-hydrated"

const submit = cn(adminButton({ tone: "primary" }), "w-full")
const values = (form: HTMLFormElement) => Object.fromEntries(new FormData(form)) as Record<string, string>

function afterPassword(needs: SignInNext, next: string) {
  if (needs === "enrol") return `/admin/mfa/setup?next=${encodeURIComponent(next)}`
  if (needs === "verify") return `/admin/mfa?next=${encodeURIComponent(next)}`
  return next
}

export function StaffLoginForm({ next }: { next: string }) {
  const hydrated = useHydrated()
  const id = useId()
  const router = useRouter()
  const login = useMutation({ mutationFn: adminAuthApi.login })
  const { errors, formError, validate, fail } = useSchemaForm(staffLoginSchema)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = validate(event.currentTarget, values(event.currentTarget))
    if (!input) return
    login.mutate(input, { onSuccess: ({ needs }) => router.replace(afterPassword(needs, next)), onError: fail })
  }

  return (
    <form method="post" noValidate onSubmit={onSubmit} aria-busy={login.isPending} className="flex flex-col gap-4">
      <AdminField formId={id} name="email" type="email" label="Work email" autoComplete="username" error={errors.email} />
      <AdminField formId={id} name="password" type="password" label="Password" autoComplete="current-password" error={errors.password} />
      <FormAlert>{formError}</FormAlert>
      <button type="submit" disabled={!hydrated || login.isPending} className={submit}>
        {login.isPending ? "Signing in…" : "Continue"}
      </button>
    </form>
  )
}

export function VerifyCodeForm({ next }: { next: string }) {
  const hydrated = useHydrated()
  const id = useId()
  const router = useRouter()
  const verify = useMutation({ mutationFn: adminAuthApi.verify })
  const { errors, formError, validate, fail } = useSchemaForm(codeSchema)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = validate(event.currentTarget, values(event.currentTarget))
    if (!input) return
    verify.mutate(input.code, {
      onSuccess: () => {
        router.replace(next)
        router.refresh()
      },
      onError: fail,
    })
  }

  return (
    <form method="post" noValidate onSubmit={onSubmit} aria-busy={verify.isPending} className="flex flex-col gap-4">
      <AdminField
        formId={id}
        name="code"
        label="Authenticator code"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={11}
        hint="Lost your phone? Enter one of your recovery codes instead."
        error={errors.code}
      />
      <FormAlert>{formError}</FormAlert>
      <button type="submit" disabled={!hydrated || verify.isPending} className={submit}>
        {verify.isPending ? "Checking…" : "Verify"}
      </button>
    </form>
  )
}

/** First sign-in: scan the QR (or type the key), confirm with a code, then keep the recovery codes. */
export function EnrolForm({ next }: { next: string }) {
  const id = useId()
  const router = useRouter()
  const begin = useMutation({ mutationFn: adminAuthApi.beginEnrolment })
  const confirm = useMutation({ mutationFn: adminAuthApi.confirmEnrolment })
  const { errors, formError, validate, fail } = useSchemaForm(codeSchema)
  const started = useRef(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    begin.mutate()
  }, [begin])

  if (confirm.data) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-18 font-bold">Save your recovery codes</h2>
        <p className="text-16 text-subtle-foreground">Each code signs you in once if you lose your phone. They won&apos;t be shown again: print them or keep them in a password manager.</p>
        <ol className="grid grid-cols-2 gap-2 rounded-md bg-surface p-4 font-mono text-16" aria-label="Recovery codes">
          {confirm.data.recoveryCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ol>
        <label className="flex items-center gap-2 text-16">
          <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} className="size-5 accent-foreground" />
          I&apos;ve saved these codes
        </label>
        <button
          type="button"
          disabled={!saved}
          className={submit}
          onClick={() => {
            router.replace(next)
            router.refresh()
          }}
        >
          Go to the admin
        </button>
      </div>
    )
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = validate(event.currentTarget, values(event.currentTarget))
    if (!input) return
    confirm.mutate(input.code, { onError: fail })
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-2 ps-5 text-16">
        <li>Open an authenticator app (Google Authenticator, 1Password, Authy…).</li>
        <li>Scan this code, or enter the key by hand.</li>
        <li>Type the 6-digit code it shows.</li>
      </ol>
      {begin.data ? (
        <div className="flex flex-col items-center gap-3 rounded-md bg-surface p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URI, nothing to optimise */}
          <img src={begin.data.qr} alt="QR code for your authenticator app" width={192} height={192} className="size-48 bg-background" />
          <p className="text-14 text-subtle-foreground">Key</p>
          <code className="text-center font-mono text-16 break-all select-all">{begin.data.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
        </div>
      ) : begin.isError ? (
        <FormAlert>{begin.error.message}</FormAlert>
      ) : (
        <p className="text-16 text-subtle-foreground">Preparing your code…</p>
      )}
      <form method="post" noValidate onSubmit={onSubmit} aria-busy={confirm.isPending} className="flex flex-col gap-4">
        <AdminField formId={id} name="code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} error={errors.code} />
        <FormAlert>{formError}</FormAlert>
        <button type="submit" disabled={confirm.isPending || !begin.data} className={submit}>
          {confirm.isPending ? "Checking…" : "Turn on two-step verification"}
        </button>
      </form>
    </div>
  )
}

export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const hydrated = useHydrated()
  const id = useId()
  const router = useRouter()
  const accept = useMutation({ mutationFn: (input: { displayName: string; password: string }) => adminAuthApi.acceptInvite(token, input) })
  const { errors, formError, validate, fail } = useSchemaForm(acceptInviteSchema)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = validate(event.currentTarget, values(event.currentTarget))
    if (!input) return
    accept.mutate(input, { onSuccess: ({ needs }) => router.replace(afterPassword(needs, "/admin")), onError: fail })
  }

  return (
    <form method="post" noValidate onSubmit={onSubmit} aria-busy={accept.isPending} className="flex flex-col gap-4">
      <AdminField formId={id} name="email" label="Work email" value={email} readOnly autoComplete="username" />
      <AdminField formId={id} name="displayName" label="Your name" autoComplete="name" error={errors.displayName} />
      <AdminField formId={id} name="password" type="password" label="Choose a password" autoComplete="new-password" hint="At least 12 characters. A short sentence works well." error={errors.password} />
      <FormAlert>{formError}</FormAlert>
      <button type="submit" disabled={!hydrated || accept.isPending} className={submit}>
        {accept.isPending ? "Creating your account…" : "Create account"}
      </button>
    </form>
  )
}
