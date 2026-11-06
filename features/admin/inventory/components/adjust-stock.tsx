"use client"

import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import { adminCatalogApi } from "@/api/admin/catalog"
import { ApiError } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { AdminField, AdminSelect } from "@/components/admin/form"
import { FormDialog } from "@/components/admin/form-dialog"

const REASONS = ["Stock count", "Received from supplier", "Damaged", "Lost", "Returned to supplier", "Other"]
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" })

/** Add or remove pairs of one size, with a reason; shows the size's recent ledger. */
export function AdjustStock({ variantId, label, onHand, reserved, canAdjust }: { variantId: string; label: string; onHand: number; reserved: number; canAdjust: boolean }) {
  const id = useId()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ledger = useQuery({ queryKey: ["admin", "movements", variantId], queryFn: () => adminCatalogApi.movements(variantId), enabled: open })

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={adminButton({ tone: canAdjust ? "secondary" : "ghost", size: "sm" })}>
        {canAdjust ? "Adjust" : "History"}
      </button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={label}
        description={`On hand ${onHand}, held in bags ${reserved}, available ${onHand - reserved}.`}
        submitLabel="Save adjustment"
        pending={pending}
        error={error}
        onSubmit={async (form) => {
          if (!canAdjust) return setOpen(false)
          const data = new FormData(form)
          const direction = data.get("direction") === "remove" ? -1 : 1
          const amount = Number(data.get("amount"))
          const reason = [String(data.get("reason") ?? ""), String(data.get("note") ?? "").trim()].filter(Boolean).join(": ")
          if (!Number.isInteger(amount) || amount <= 0) return setError("Enter a whole number of pairs.")
          setPending(true)
          setError(null)
          try {
            await adminCatalogApi.adjustStock(variantId, direction * amount, reason)
            setOpen(false)
            router.refresh()
          } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : "That didn't save. Please try again.")
          } finally {
            setPending(false)
          }
        }}
      >
        {canAdjust ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <AdminSelect formId={id} name="direction" label="Change">
                <option value="add">Add pairs</option>
                <option value="remove">Remove pairs</option>
              </AdminSelect>
              <AdminField formId={id} name="amount" label="How many" type="number" min={1} max={10000} defaultValue="1" />
            </div>
            <AdminSelect formId={id} name="reason" label="Reason">
              {REASONS.map((reason) => (
                <option key={reason}>{reason}</option>
              ))}
            </AdminSelect>
            <AdminField formId={id} name="note" label="Note (optional)" maxLength={120} />
          </>
        ) : null}
        <section className="flex flex-col gap-1.5">
          <h3 className="text-14 font-bold">Recent changes</h3>
          {ledger.data?.movements.length === 0 ? <p className="text-14 text-subtle-foreground">No manual changes yet.</p> : null}
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-14">
            {ledger.data?.movements.map((movement) => (
              <li key={movement.id} className="flex justify-between gap-2">
                <span>
                  <strong className="tabular-nums">{movement.delta > 0 ? `+${movement.delta}` : movement.delta}</strong> · {movement.reason}
                </span>
                <span className="text-subtle-foreground">{when(movement.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      </FormDialog>
    </>
  )
}
