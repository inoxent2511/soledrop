"use client"

import "@/lib/validation"

import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useId, useState, type FormEvent } from "react"
import { z } from "zod"

import { adminAccountApi } from "@/api/admin/account"
import { ApiError } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { AdminCard } from "@/components/admin/card"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { AdminField, FormAlert } from "@/components/admin/form"
import { StatusPill } from "@/components/admin/status-pill"
import { useStepUp } from "@/components/admin/step-up"
import { useSchemaForm } from "@/features/account/components/form-field"
import { staffPasswordSchema } from "@/features/admin/auth/schemas"
import { useChangeStaffPassword, useRevokeSession, useStaffSessions } from "@/hooks/api/admin/account/queries"
import { useHydrated } from "@/hooks/use-hydrated"

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })

function device(userAgent: string | null) {
  if (!userAgent) return "Unknown device"
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "Browser"
  const os = /Windows/.test(userAgent) ? "Windows" : /Mac OS X/.test(userAgent) ? "macOS" : /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Linux/.test(userAgent) ? "Linux" : ""
  return os ? `${browser} on ${os}` : browser
}

export function SessionsPanel() {
  const router = useRouter()
  const sessions = useStaffSessions()
  const revoke = useRevokeSession()
  const [confirming, setConfirming] = useState(false)
  const everywhere = useMutation({
    mutationFn: adminAccountApi.signOutEverywhere,
    onSuccess: () => {
      router.replace("/admin/login")
      router.refresh()
    },
  })

  return (
    <AdminCard
      title="Where you're signed in"
      description="Sessions end after 30 minutes without activity and 12 hours in all."
      actions={
        <button type="button" className={adminButton({ tone: "secondary", size: "sm" })} onClick={() => setConfirming(true)}>
          Sign out everywhere
        </button>
      }
    >
      {sessions.isPending ? <p className="text-16 text-subtle-foreground">Loading sessions…</p> : null}
      {sessions.isError ? <FormAlert>{sessions.error.message}</FormAlert> : null}
      <ul className="flex flex-col divide-y divide-border">
        {sessions.data?.sessions.map((session) => (
          <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex flex-col gap-0.5">
              <p className="flex items-center gap-2 text-16 font-semibold">
                {device(session.userAgent)} {session.current ? <StatusPill tone="success">This device</StatusPill> : null}
              </p>
              <p className="text-14 text-subtle-foreground">
                {session.ip ?? "Unknown address"} · signed in {when(session.createdAt)} · last active {when(session.lastSeenAt)}
              </p>
            </div>
            {session.current ? null : (
              <button type="button" disabled={revoke.isPending} onClick={() => revoke.mutate(session.id)} className={adminButton({ tone: "ghost", size: "sm" })}>
                Sign out
              </button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Sign out everywhere?"
        consequence="Every session ends, this one included. You'll sign in again with your password and authenticator code."
        confirmLabel="Sign out everywhere"
        pending={everywhere.isPending}
        error={everywhere.error?.message}
        onConfirm={() => everywhere.mutate()}
      />
    </AdminCard>
  )
}

const passwordForm = z
  .object({ currentPassword: z.string().min(1, "Enter your current password"), newPassword: staffPasswordSchema, confirmPassword: z.string() })
  .refine((value) => value.newPassword === value.confirmPassword, { message: "The passwords don't match", path: ["confirmPassword"] })

export function PasswordPanel() {
  const id = useId()
  const hydrated = useHydrated()
  const change = useChangeStaffPassword()
  const { errors, formError, validate, fail } = useSchemaForm(passwordForm)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const input = validate(form, Object.fromEntries(new FormData(form)))
    if (!input) return
    change.mutate({ currentPassword: input.currentPassword, newPassword: input.newPassword }, { onSuccess: () => form.reset(), onError: fail })
  }

  return (
    <AdminCard title="Password" description="Changing it signs you out on your other devices.">
      <form method="post" noValidate onSubmit={onSubmit} className="flex max-w-md flex-col gap-4">
        <AdminField formId={id} name="currentPassword" type="password" label="Current password" autoComplete="current-password" error={errors.currentPassword} />
        <AdminField formId={id} name="newPassword" type="password" label="New password" autoComplete="new-password" hint="At least 12 characters." error={errors.newPassword} />
        <AdminField formId={id} name="confirmPassword" type="password" label="Repeat the new password" autoComplete="new-password" error={errors.confirmPassword} />
        <FormAlert>{formError}</FormAlert>
        {change.isSuccess ? (
          <p role="status" className="text-14 font-medium text-success-foreground">
            Password changed.
          </p>
        ) : null}
        <button type="submit" disabled={!hydrated || change.isPending} className={adminButton({ tone: "primary" })}>
          {change.isPending ? "Saving…" : "Change password"}
        </button>
      </form>
    </AdminCard>
  )
}

export function RecoveryCodesPanel() {
  const withStepUp = useStepUp()
  const [codes, setCodes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function regenerate() {
    setBusy(true)
    setError(null)
    try {
      setCodes((await withStepUp(() => adminAccountApi.regenerateRecoveryCodes())).recoveryCodes)
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "That didn't work. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminCard title="Recovery codes" description="Each code signs you in once if you lose your authenticator. New codes replace all the old ones.">
      {codes ? (
        <ol className="grid max-w-md grid-cols-2 gap-2 rounded-md bg-surface p-4 font-mono text-16" aria-label="New recovery codes">
          {codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ol>
      ) : null}
      <FormAlert>{error}</FormAlert>
      <div>
        <button type="button" disabled={busy} onClick={() => void regenerate()} className={adminButton({ tone: "secondary" })}>
          {busy ? "Working…" : "Make new recovery codes"}
        </button>
      </div>
    </AdminCard>
  )
}
