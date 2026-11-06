"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { ApiError, request } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { FormAlert } from "@/components/admin/form"

const message = (failure: unknown) => (failure instanceof ApiError ? failure.message : "That didn't work. Please try again.")

/** A feature flag's on/off switch (an environment override wins and disables the switch). */
export function FlagSwitch({ flagKey, enabled, overridden, canChange }: { flagKey: string; enabled: boolean; overridden: boolean; canChange: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-end gap-1">
      <label className="flex items-center gap-2 text-14">
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          disabled={!canChange || overridden || busy}
          aria-label={`${flagKey} ${enabled ? "on" : "off"}`}
          onChange={async (event) => {
            setBusy(true)
            setError(null)
            try {
              await request(`/api/admin/settings/flags/${encodeURIComponent(flagKey)}`, { method: "PATCH", body: { enabled: event.target.checked } })
              router.refresh()
            } catch (failure) {
              setError(message(failure))
            } finally {
              setBusy(false)
            }
          }}
          className="size-5 accent-foreground"
        />
        {enabled ? "On" : "Off"}
      </label>
      <FormAlert>{error}</FormAlert>
    </div>
  )
}

/** Run a background job now, or retry one failed event. */
const SUMMARY = {
  outbox: (result: Record<string, number>) => `Sent ${result.delivered ?? 0}, failed ${result.failed ?? 0}.`,
  released: (result: Record<string, number>) => `Released ${result.released ?? 0}.`,
  purged: (result: Record<string, number>) => `Deleted ${result.purged ?? 0}.`,
}

export function RunButton({ label, path, summary }: { label: string; path: string; summary?: keyof typeof SUMMARY }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            const result = await request<{ result?: unknown }>(path, { method: "POST" })
            setNote(summary ? SUMMARY[summary]((result?.result ?? {}) as Record<string, number>) : "Done.")
            router.refresh()
          } catch (failure) {
            setError(message(failure))
          } finally {
            setBusy(false)
          }
        }}
        className={adminButton({ tone: "secondary", size: "sm" })}
      >
        {busy ? "Running…" : label}
      </button>
      {note ? (
        <span role="status" className="text-14 text-subtle-foreground">
          {note}
        </span>
      ) : null}
      <FormAlert>{error}</FormAlert>
    </span>
  )
}
