"use client"

import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import { adminOrdersApi } from "@/api/admin/orders"
import { ApiError } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { AdminTextarea, FormAlert } from "@/components/admin/form"
import { useHydrated } from "@/hooks/use-hydrated"

/** Adds a staff-only note; the page re-renders with it on the timeline. */
export function OrderNoteForm({ number }: { number: string }) {
  const id = useId()
  const hydrated = useHydrated()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      method="post"
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault()
        const form = event.currentTarget
        const body = String(new FormData(form).get("body") ?? "").trim()
        if (!body) return setError("Write a note first.")
        setPending(true)
        setError(null)
        try {
          await adminOrdersApi.addNote(number, body)
          form.reset()
          router.refresh()
        } catch (failure) {
          setError(failure instanceof ApiError ? failure.message : "That didn't save. Please try again.")
        } finally {
          setPending(false)
        }
      }}
    >
      <AdminTextarea formId={id} name="body" label="Add a staff note" hint="Only staff see notes." maxLength={2000} />
      <FormAlert>{error}</FormAlert>
      <div>
        <button type="submit" disabled={!hydrated || pending} className={adminButton({ tone: "secondary", size: "sm" })}>
          {pending ? "Saving…" : "Add note"}
        </button>
      </div>
    </form>
  )
}

/** Approve, reject or receive a return request. */
export function ReturnActions({ number, returnId, status }: { number: string; returnId: string; status: "requested" | "approved" | "received" | "rejected" }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const decide = async (decision: "approved" | "rejected" | "received") => {
    setPending(true)
    setError(null)
    try {
      await adminOrdersApi.decideReturn(number, returnId, { decision })
      router.refresh()
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "That didn't work. Please try again.")
    } finally {
      setPending(false)
    }
  }
  if (status === "received" || status === "rejected") return null
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "requested" ? (
          <>
            <button type="button" disabled={pending} onClick={() => void decide("approved")} className={adminButton({ tone: "primary", size: "sm" })}>
              Approve
            </button>
            <button type="button" disabled={pending} onClick={() => void decide("rejected")} className={adminButton({ tone: "ghost", size: "sm" })}>
              Reject
            </button>
          </>
        ) : null}
        <button type="button" disabled={pending} onClick={() => void decide("received")} className={adminButton({ tone: "secondary", size: "sm" })}>
          Received — restock
        </button>
      </div>
      <FormAlert>{error}</FormAlert>
    </div>
  )
}
