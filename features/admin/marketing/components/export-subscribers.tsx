"use client"

import { Download } from "lucide-react"
import { useState } from "react"

import { ApiError } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { useStepUp } from "@/components/admin/step-up"

/** Downloads the subscribed addresses as CSV after a reason and a fresh second factor. */
export function ExportSubscribers() {
  const withStepUp = useStepUp()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download(reason: string) {
    const response = await fetch("/api/admin/marketing/subscribers/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }), credentials: "same-origin" })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new ApiError(response.status, body?.error?.code ?? "internal", body?.error?.message ?? "The export failed.", body?.error?.details)
    }
    const url = URL.createObjectURL(await response.blob())
    Object.assign(document.createElement("a"), { href: url, download: "newsletter.csv" }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={adminButton({ tone: "secondary", size: "sm" })}>
        <Download aria-hidden /> Export subscribers
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Export the newsletter list?"
        consequence="Downloads every subscribed email address. Keep the file safe and delete it once it's imported into your email tool."
        confirmLabel="Download"
        tone="primary"
        reason="required"
        pending={pending}
        error={error}
        onConfirm={async ({ reason }) => {
          setPending(true)
          setError(null)
          try {
            await withStepUp(() => download(reason ?? ""))
            setOpen(false)
          } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : "The export failed.")
          } finally {
            setPending(false)
          }
        }}
      />
    </>
  )
}
