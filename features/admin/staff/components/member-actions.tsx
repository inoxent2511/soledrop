"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { ApiError, request } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { FormAlert } from "@/components/admin/form"
import { useStepUp } from "@/components/admin/step-up"

type Props = { userId: string; email: string; status: "invited" | "active" | "suspended"; roles: string[]; allRoles: { key: string; name: string }[]; self: boolean }

/** Roles, suspend / reactivate and MFA reset for one member. Each change ends their sessions. */
export function MemberActions({ userId, email, status, roles, allRoles, self }: Props) {
  const router = useRouter()
  const withStepUp = useStepUp()
  const [chosen, setChosen] = useState(new Set(roles))
  const [dialog, setDialog] = useState<null | "suspend" | "reset">(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const base = `/api/admin/staff/${userId}`

  async function run(body: Record<string, unknown>) {
    setPending(true)
    setError(null)
    try {
      await withStepUp(() => request(base, { method: "PATCH", body }))
      setDialog(null)
      router.refresh()
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "That didn't work. Please try again.")
    } finally {
      setPending(false)
    }
  }

  const changed = chosen.size !== roles.length || [...chosen].some((key) => !roles.includes(key))

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="pb-1 text-14 font-bold">Roles</legend>
        {allRoles.map((role) => (
          <label key={role.key} className="flex items-center gap-2 text-16">
            <input
              type="checkbox"
              checked={chosen.has(role.key)}
              onChange={(event) => {
                const next = new Set(chosen)
                if (event.target.checked) next.add(role.key)
                else next.delete(role.key)
                setChosen(next)
              }}
              className="size-4 accent-foreground"
            />
            {role.name}
          </label>
        ))}
      </fieldset>
      <div>
        <button type="button" disabled={!changed || pending || chosen.size === 0} onClick={() => void run({ action: "roles", roleKeys: [...chosen] })} className={adminButton({ tone: "primary", size: "sm" })}>
          Save roles
        </button>
      </div>
      <FormAlert>{dialog === null ? error : null}</FormAlert>
      {!self ? (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {status === "suspended" ? (
            <button type="button" disabled={pending} onClick={() => void run({ action: "status", status: "active" })} className={adminButton({ tone: "secondary", size: "sm" })}>
              Reactivate
            </button>
          ) : (
            <button type="button" onClick={() => setDialog("suspend")} className={adminButton({ tone: "secondary", size: "sm" })}>
              Suspend
            </button>
          )}
          <button type="button" onClick={() => setDialog("reset")} className={adminButton({ tone: "ghost", size: "sm" })}>
            Reset two-step verification
          </button>
        </div>
      ) : (
        <p className="text-14 text-subtle-foreground">You can&apos;t suspend yourself or reset your own two-step verification here; use Your account.</p>
      )}
      <ConfirmDialog
        open={dialog === "suspend"}
        onOpenChange={(next) => !next && setDialog(null)}
        title={`Suspend ${email}?`}
        consequence="They're signed out everywhere at once and can't sign in until reactivated."
        confirmLabel="Suspend"
        reason="required"
        pending={pending}
        error={error}
        onConfirm={({ reason }) => void run({ action: "status", status: "suspended", reason })}
      />
      <ConfirmDialog
        open={dialog === "reset"}
        onOpenChange={(next) => !next && setDialog(null)}
        title="Reset two-step verification?"
        consequence="For a lost phone. They're signed out and set up a new authenticator at their next sign-in. Check it's really them first."
        confirmLabel="Reset"
        typeToConfirm={email}
        reason="required"
        pending={pending}
        error={error}
        onConfirm={({ reason }) => void run({ action: "reset_mfa", reason })}
      />
    </div>
  )
}
