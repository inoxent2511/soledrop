"use client"

import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import { ApiError, request } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { AdminField } from "@/components/admin/form"
import { FormDialog } from "@/components/admin/form-dialog"
import { formatPrice } from "@/lib/format"

/** "Received": records a bank transfer seen on the statement against this order. */
export function ReconcileButton({ number, total }: { number: string; total: number }) {
  const id = useId()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState(() => crypto.randomUUID())
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setKey(crypto.randomUUID())
          setError(null)
          setOpen(true)
        }}
        className={adminButton({ tone: "primary", size: "sm" })}
      >
        Received
      </button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={`Bank transfer for ${number}`}
        description={`The order total is ${formatPrice(total)}. It is confirmed once paid in full.`}
        submitLabel="Record transfer"
        pending={pending}
        error={error}
        onSubmit={async (form) => {
          const data = new FormData(form)
          const amount = Math.round(Number(String(data.get("amount") ?? "").replace(/,/g, "")) * 100)
          const reference = String(data.get("reference") ?? "").trim()
          if (!amount || amount <= 0) return setError("Enter the amount received.")
          if (reference.length < 2) return setError("Add the bank reference.")
          setPending(true)
          setError(null)
          try {
            await request("/api/admin/payments/reconcile", { method: "POST", body: { number, amount, reference, idempotencyKey: key } })
            setOpen(false)
            router.refresh()
          } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : "That didn't save. Please try again.")
          } finally {
            setPending(false)
          }
        }}
      >
        <AdminField formId={id} name="amount" label="Amount received (Rs.)" inputMode="decimal" defaultValue={String(total / 100)} />
        <AdminField formId={id} name="reference" label="Bank reference" maxLength={120} hint="As it appears on the statement." />
      </FormDialog>
    </>
  )
}
