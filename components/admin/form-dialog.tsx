"use client"

import { Dialog } from "@base-ui/react/dialog"
import type { FormEvent, ReactNode } from "react"

import { adminButton } from "@/components/admin/button"
import { dialogBackdrop, dialogPopup } from "@/components/admin/confirm-dialog"
import { FormAlert } from "@/components/admin/form"

/** A dialog wrapping one form: title, optional description, fields, Cancel and a submit button. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  pending,
  error,
  tone = "primary",
  onSubmit,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  submitLabel: string
  pending?: boolean
  error?: string | null
  tone?: "primary" | "danger"
  onSubmit: (form: HTMLFormElement) => void
  children: ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogBackdrop} />
        <Dialog.Popup className={dialogPopup}>
          <Dialog.Title className="text-20 font-extrabold">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description render={<div />} className="text-16 text-subtle-foreground">
              {description}
            </Dialog.Description>
          ) : null}
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault()
              onSubmit(event.currentTarget)
            }}
          >
            {children}
            <FormAlert>{error}</FormAlert>
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close className={adminButton({ tone: "ghost" })}>Cancel</Dialog.Close>
              <button type="submit" disabled={pending} className={adminButton({ tone: tone === "danger" ? "danger" : "primary" })}>
                {pending ? "Working…" : submitLabel}
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
