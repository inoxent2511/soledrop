"use client"

import { Dialog } from "@base-ui/react/dialog"
import { useId, useState, type ReactNode } from "react"

import { adminButton } from "@/components/admin/button"
import { adminControl, FormAlert } from "@/components/admin/form"
import { cn } from "@/lib/utils"

export const dialogBackdrop = "fixed inset-0 z-overlay bg-foreground/60 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0"
export const dialogPopup =
  "fixed start-1/2 top-1/2 z-overlay flex max-h-[calc(100dvh-4rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg bg-background p-5 text-foreground shadow-card-lift transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 rtl:translate-x-1/2"

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** What will happen, in plain words (admin-design.md §5). */
  consequence: ReactNode
  confirmLabel: string
  tone?: "danger" | "primary"
  /** Type-to-confirm: the exact text the person must type (an order number, an email). */
  typeToConfirm?: string
  /** Asks for a reason, stored on the audit entry. */
  reason?: "required" | "optional"
  pending?: boolean
  error?: string | null
  onConfirm: (input: { reason: string | null }) => void
}

/** Confirms an irreversible action: states the consequence, optionally asks for the subject typed and a reason. */
export function ConfirmDialog({ open, onOpenChange, title, consequence, confirmLabel, tone = "danger", typeToConfirm, reason, pending, error, onConfirm }: ConfirmDialogProps) {
  const id = useId()
  const [typed, setTyped] = useState("")
  const [why, setWhy] = useState("")
  const ready = (!typeToConfirm || typed.trim() === typeToConfirm) && (reason !== "required" || why.trim().length >= 3) && !pending

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setTyped("")
          setWhy("")
        }
        onOpenChange(next)
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogBackdrop} />
        <Dialog.Popup className={dialogPopup}>
          <Dialog.Title className="text-20 font-extrabold">{title}</Dialog.Title>
          <Dialog.Description render={<div />} className="text-16 text-subtle-foreground">
            {consequence}
          </Dialog.Description>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (ready) onConfirm({ reason: why.trim() || null })
            }}
          >
            {typeToConfirm ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-type`} className="text-14 font-bold">
                  Type <span className="font-mono">{typeToConfirm}</span> to confirm
                </label>
                <input id={`${id}-type`} value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" className={adminControl} />
              </div>
            ) : null}
            {reason ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-reason`} className="text-14 font-bold">
                  Reason {reason === "optional" ? <span className="font-normal text-subtle-foreground">(optional)</span> : null}
                </label>
                <textarea id={`${id}-reason`} value={why} onChange={(event) => setWhy(event.target.value)} maxLength={500} className={cn(adminControl, "h-auto min-h-20 py-2")} />
                <p className="text-14 text-subtle-foreground">Saved on the audit log.</p>
              </div>
            ) : null}
            <FormAlert>{error}</FormAlert>
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close className={adminButton({ tone: "ghost" })}>Cancel</Dialog.Close>
              <button type="submit" disabled={!ready} className={adminButton({ tone: tone === "danger" ? "danger" : "primary" })}>
                {pending ? "Working…" : confirmLabel}
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
