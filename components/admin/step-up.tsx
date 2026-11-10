"use client"

import { Dialog } from "@base-ui/react/dialog"
import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from "react"

import { adminAuthApi } from "@/api/admin/auth"
import { ApiError } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { dialogBackdrop, dialogPopup } from "@/components/admin/confirm-dialog"
import { adminControl, FormAlert } from "@/components/admin/form"

type Pending = { resolve: () => void; reject: (error: unknown) => void }

const StepUpContext = createContext<(<T>(action: () => Promise<T>) => Promise<T>) | null>(null)

const needsStepUp = (error: unknown) => error instanceof ApiError && error.status === 403 && error.details?.stepUp === true

/**
 * Step-up for sensitive actions (A-003). `withStepUp(action)` runs the action; if the server answers
 * that a fresh second factor is needed, it asks for the authenticator code, proves it, and runs the
 * action once more. Cancelling rejects with the original error.
 */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef<Pending | null>(null)
  const original = useRef<unknown>(null)

  const ask = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        pending.current = { resolve, reject }
        setCode("")
        setError(null)
        setOpen(true)
      }),
    [],
  )

  const withStepUp = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      try {
        return await action()
      } catch (failure) {
        if (!needsStepUp(failure)) throw failure
        original.current = failure
        await ask()
        return action()
      }
    },
    [ask],
  )

  async function submit() {
    setBusy(true)
    try {
      await adminAuthApi.stepUp(code)
      setOpen(false)
      pending.current?.resolve()
      pending.current = null
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "That didn't work. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepUpContext.Provider value={withStepUp}>
      {children}
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!next && pending.current) {
            pending.current.reject(original.current)
            pending.current = null
          }
          setOpen(next)
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className={dialogBackdrop} />
          <Dialog.Popup className={dialogPopup}>
            <Dialog.Title className="text-20 font-extrabold">Confirm it&apos;s you</Dialog.Title>
            <Dialog.Description className="text-16 text-subtle-foreground">This action is sensitive. Enter the 6-digit code from your authenticator app to continue.</Dialog.Description>
            <form
              method="post"
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
            >
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-code`} className="text-14 font-bold">
                  Authenticator code
                </label>
                <input
                  id={`${id}-code`}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={11}
                  className={adminControl}
                  aria-invalid={error ? true : undefined}
                />
              </div>
              <FormAlert>{error}</FormAlert>
              <div className="flex justify-end gap-2">
                <Dialog.Close className={adminButton({ tone: "ghost" })}>Cancel</Dialog.Close>
                <button type="submit" disabled={busy || code.trim().length < 6} className={adminButton({ tone: "primary" })}>
                  {busy ? "Checking…" : "Confirm"}
                </button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </StepUpContext.Provider>
  )
}

export function useStepUp() {
  const context = useContext(StepUpContext)
  if (!context) throw new Error("useStepUp needs <StepUpProvider> (the admin shell provides it)")
  return context
}
