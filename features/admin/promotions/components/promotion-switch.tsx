"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { ApiError, request } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { FormAlert } from "@/components/admin/form"

/** Switch a promotion on or off, or delete one nobody has used. */
export function PromotionSwitch({ id, active, used }: { id: string; active: boolean; used: boolean }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (work: () => Promise<unknown>, after?: () => void) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      if (after) after()
      else router.refresh()
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "That didn't work. Please try again.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void run(() => request(`/api/admin/promotions/${id}/active`, { method: "POST", body: { active: !active } }))} className={adminButton({ tone: "secondary", size: "sm" })}>
          {active ? "Switch off" : "Switch on"}
        </button>
        {!used ? (
          <button type="button" disabled={busy} onClick={() => void run(() => request(`/api/admin/promotions/${id}`, { method: "DELETE" }), () => router.replace("/admin/promotions"))} className={adminButton({ tone: "ghost", size: "sm" })}>
            Delete
          </button>
        ) : null}
      </div>
      <FormAlert>{error}</FormAlert>
    </div>
  )
}
