"use client"

import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import { adminOrdersApi } from "@/api/admin/orders"
import { ApiError } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { AdminField, AdminSelect, AdminTextarea, FormAlert } from "@/components/admin/form"
import { FormDialog } from "@/components/admin/form-dialog"
import { useStepUp } from "@/components/admin/step-up"
import { TRANSITION_VERB } from "@/features/admin/orders/status"
import { formatPrice } from "@/lib/format"
import type { OrderStatus } from "@/server/orders/types"

type Line = { id: string; title: string; size: string; quantity: number; refundedQuantity: number; total: number }

export type OrderActionsProps = {
  number: string
  updatedAt: string
  currency: "PKR" | "USD" | "AED" | "GBP"
  outstanding: number
  trackingNumber: string | null
  lines: Line[]
  actions: { transitions: OrderStatus[]; markPaid: boolean; refund: boolean; refundable: number; refundLimit: number | null }
}

const message = (failure: unknown) => (failure instanceof ApiError ? failure.message : "Something went wrong. Please try again.")
const key = () => crypto.randomUUID()
/** "1,250.50" → 125050 minor units; null when not a positive amount. */
const toMinor = (value: FormDataEntryValue | null) => {
  const amount = Number(String(value ?? "").replace(/,/g, ""))
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null
}

/** The side-column actions on an order: next status, record payment, refund, cancel. Each offers only what the member may do. */
export function OrderActions({ number, updatedAt, currency, outstanding, trackingNumber, lines, actions }: OrderActionsProps) {
  const id = useId()
  const router = useRouter()
  const withStepUp = useStepUp()
  const [dialog, setDialog] = useState<null | OrderStatus | "pay" | "refund">(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One idempotency key per open dialog, so a double submit records once.
  const [attempt, setAttempt] = useState(key)

  const open = (next: typeof dialog) => {
    setError(null)
    setAttempt(key())
    setDialog(next)
  }

  async function run(work: () => Promise<unknown>) {
    setPending(true)
    setError(null)
    try {
      await work()
      setDialog(null)
      router.refresh()
    } catch (failure) {
      setError(message(failure))
    } finally {
      setPending(false)
    }
  }

  const forward = actions.transitions.filter((to) => to !== "cancelled")
  const canCancel = actions.transitions.includes("cancelled")
  const shipping = dialog === "shipped"
  const statusDialog = dialog && dialog !== "pay" && dialog !== "refund" && dialog !== "cancelled" ? dialog : null
  const limitNote = actions.refundLimit === null ? null : `Your limit is ${formatPrice(actions.refundLimit, currency)} per refund.`

  if (!forward.length && !canCancel && !actions.markPaid && !actions.refund) {
    return <p className="text-14 text-subtle-foreground">Nothing for you to do on this order.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {forward.map((to, index) => (
        <button key={to} type="button" onClick={() => open(to)} className={adminButton({ tone: index === 0 ? "primary" : "secondary" })}>
          {TRANSITION_VERB[to]}
        </button>
      ))}
      {actions.markPaid ? (
        <button type="button" onClick={() => open("pay")} className={adminButton({ tone: forward.length ? "secondary" : "primary" })}>
          Record payment
        </button>
      ) : null}
      {actions.refund ? (
        <button type="button" onClick={() => open("refund")} className={adminButton({ tone: "secondary" })}>
          Refund
        </button>
      ) : null}
      {canCancel ? (
        <button type="button" onClick={() => open("cancelled")} className={adminButton({ tone: "ghost" })}>
          Cancel order
        </button>
      ) : null}

      <FormDialog
        open={statusDialog !== null}
        onOpenChange={(next) => !next && setDialog(null)}
        title={statusDialog ? `${TRANSITION_VERB[statusDialog]} — ${number}` : ""}
        description={shipping ? "The customer gets an email with the tracking number." : "The customer is told about the change by email."}
        submitLabel={statusDialog ? TRANSITION_VERB[statusDialog] : "Save"}
        pending={pending}
        error={error}
        onSubmit={(form) => {
          const data = new FormData(form)
          void run(() =>
            adminOrdersApi.transition(number, {
              to: statusDialog as OrderStatus,
              note: String(data.get("note") ?? "").trim() || undefined,
              trackingNumber: String(data.get("trackingNumber") ?? "").trim() || undefined,
              expectedUpdatedAt: updatedAt,
            }),
          )
        }}
      >
        {shipping ? <AdminField formId={id} name="trackingNumber" label="Courier tracking number" defaultValue={trackingNumber ?? ""} required maxLength={80} /> : null}
        <AdminTextarea formId={id} name="note" label="Note on the order history (optional)" maxLength={500} />
      </FormDialog>

      <FormDialog
        open={dialog === "pay"}
        onOpenChange={(next) => !next && setDialog(null)}
        title={`Record a payment — ${number}`}
        description="For cash the courier collected or a bank transfer you can see on the statement. The order is confirmed once it's paid in full."
        submitLabel="Record payment"
        pending={pending}
        error={error}
        onSubmit={(form) => {
          const data = new FormData(form)
          const amount = toMinor(data.get("amount"))
          if (!amount) return setError("Enter the amount received.")
          void run(() => adminOrdersApi.markPaid(number, { provider: data.get("provider") === "bank_transfer" ? "bank_transfer" : "cod", amount, reference: String(data.get("reference") ?? "").trim() || undefined, idempotencyKey: attempt }))
        }}
      >
        <AdminSelect formId={id} name="provider" label="How it was paid">
          <option value="cod">Cash on delivery</option>
          <option value="bank_transfer">Bank transfer</option>
        </AdminSelect>
        <AdminField formId={id} name="amount" label={`Amount (${currency})`} inputMode="decimal" defaultValue={outstanding > 0 ? String(outstanding / 100) : ""} />
        <AdminField formId={id} name="reference" label="Reference (optional)" hint="Bank reference or courier slip number." maxLength={120} />
      </FormDialog>

      <FormDialog
        open={dialog === "refund"}
        onOpenChange={(next) => !next && setDialog(null)}
        title={`Refund — ${number}`}
        description={
          <>
            Up to {formatPrice(actions.refundable, currency)} can be refunded. {limitNote} You&apos;ll be asked for your authenticator code.
          </>
        }
        submitLabel="Refund"
        tone="danger"
        pending={pending}
        error={error}
        onSubmit={(form) => {
          const data = new FormData(form)
          const amount = toMinor(data.get("amount"))
          const reason = String(data.get("reason") ?? "").trim()
          if (!amount) return setError("Enter the amount to refund.")
          if (reason.length < 3) return setError("Give a reason for the refund.")
          const refundLines = lines.map((line) => ({ orderLineId: line.id, quantity: Number(data.get(`qty-${line.id}`) ?? 0) })).filter((line) => line.quantity > 0)
          void run(() => withStepUp(() => adminOrdersApi.refund(number, { amount, reason, lines: refundLines, restock: data.get("restock") === "on", idempotencyKey: attempt })))
        }}
      >
        <fieldset className="min-w-0 flex flex-col gap-2">
          <legend className="pb-1.5 text-14 font-bold">Items coming back (optional)</legend>
          {lines.map((line) => {
            const left = line.quantity - line.refundedQuantity
            return (
              <label key={line.id} className="flex items-center justify-between gap-3 text-14">
                <span>
                  {line.title} · {line.size}
                </span>
                <select name={`qty-${line.id}`} defaultValue="0" disabled={left <= 0} className="h-9 rounded-md border-2 border-control-border bg-background px-2" aria-label={`Quantity of ${line.title} to refund`}>
                  {Array.from({ length: left + 1 }, (_, quantity) => (
                    <option key={quantity} value={quantity}>
                      {quantity}
                    </option>
                  ))}
                </select>
              </label>
            )
          })}
        </fieldset>
        <label className="flex items-center gap-2 text-14">
          <input type="checkbox" name="restock" className="size-4 accent-foreground" /> Put those items back in stock
        </label>
        <AdminField formId={id} name="amount" label={`Amount (${currency})`} inputMode="decimal" />
        <AdminTextarea formId={id} name="reason" label="Reason" required maxLength={500} hint="Saved on the order and the audit log." />
      </FormDialog>

      <ConfirmDialog
        open={dialog === "cancelled"}
        onOpenChange={(next) => !next && setDialog(null)}
        title={`Cancel ${number}?`}
        consequence="Unshipped items go back into stock and the customer is emailed. This can't be undone; paid orders still need a refund."
        confirmLabel="Cancel order"
        typeToConfirm={number}
        reason="required"
        pending={pending}
        error={error}
        onConfirm={({ reason }) => void run(() => adminOrdersApi.transition(number, { to: "cancelled", reason, expectedUpdatedAt: updatedAt }))}
      />
      <FormAlert>{dialog === null ? error : null}</FormAlert>
    </div>
  )
}
