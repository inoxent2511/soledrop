"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useId, useState, type FormEvent } from "react"

import { ApiError } from "@/api/http"
import { returnRequestSchema } from "@/features/checkout/schemas/checkout"
import { useCancelOrder, useRequestReturn } from "@/hooks/api/checkout/mutations"
import { cn } from "@/lib/utils"
import type { OrderDto } from "@/server/http/dto"

const action = "flex h-14 w-full items-center justify-center rounded-lg text-20 font-semibold transition-colors disabled:opacity-50 md:h-16 md:text-22"
const message = (failure: unknown) => (failure instanceof ApiError ? failure.message : "Something went wrong. Please try again.")

/**
 * The shopper's own order actions. Cancelling asks once more before it happens (it can't be
 * undone); a return names the pairs and a reason. Both refresh the server-rendered order.
 */
export function OrderActions({ order, token }: { order: OrderDto; token: string | null }) {
  const id = useId()
  const router = useRouter()
  const cancel = useCancelOrder(order.number, token)
  const requestReturn = useRequestReturn(order.number, token)
  const [confirming, setConfirming] = useState(false)
  const [returning, setReturning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  function onReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const lines = order.lines
      .filter((line) => data.get(`line-${line.id}`) === "on")
      .map((line) => ({ orderLineId: line.id, quantity: line.quantity - line.refundedQuantity }))
    const parsed = returnRequestSchema.safeParse({ lines, reason: String(data.get("reason") ?? "") })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form.")
      return
    }
    setError(null)
    requestReturn.mutate(parsed.data, {
      onSuccess: () => {
        setReturning(false)
        setDone("Return requested. We'll email you the drop-off details within one working day.")
        router.refresh()
      },
      onError: (failure) => setError(message(failure)),
    })
  }

  return (
    <div className="flex flex-col gap-4 pt-8">
      <p role="status" className="text-16 font-semibold text-success empty:hidden md:text-18">
        {done}
      </p>

      {order.canCancel && !confirming ? (
        <button type="button" onClick={() => setConfirming(true)} className={cn(action, "border-2 border-foreground hover:bg-foreground hover:text-background")}>
          Cancel order
        </button>
      ) : null}
      {order.canCancel && confirming ? (
        <div role="group" aria-labelledby={`${id}-cancel`} className="flex flex-col gap-3 rounded-lg border-2 border-destructive p-4">
          <p id={`${id}-cancel`} className="text-18 font-semibold">
            Cancel order {order.number}? This can&rsquo;t be undone.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() =>
                cancel.mutate(undefined, {
                  onSuccess: () => {
                    setConfirming(false)
                    setDone("Your order is cancelled.")
                    router.refresh()
                  },
                  onError: (failure) => setError(message(failure)),
                })
              }
              className={cn(action, "bg-destructive text-background hover:bg-foreground")}
            >
              {cancel.isPending ? "Cancelling…" : "Yes, cancel"}
            </button>
            <button type="button" autoFocus onClick={() => setConfirming(false)} className={cn(action, "border-2 border-foreground hover:bg-foreground hover:text-background")}>
              Keep order
            </button>
          </div>
        </div>
      ) : null}

      {order.canRequestReturn && !returning ? (
        <button type="button" onClick={() => setReturning(true)} className={cn(action, "border-2 border-foreground hover:bg-foreground hover:text-background")}>
          Request a return
        </button>
      ) : null}
      {order.canRequestReturn && returning ? (
        <form noValidate onSubmit={onReturn} aria-labelledby={`${id}-return`} className="flex flex-col gap-4 rounded-lg border-2 border-foreground p-4">
          <p id={`${id}-return`} className="text-18 font-semibold">
            Which pairs are you returning?
          </p>
          {order.lines
            .filter((line) => line.quantity > line.refundedQuantity)
            .map((line) => (
              <label key={line.id} className="flex min-h-11 items-center gap-3 text-16 md:text-18">
                <input type="checkbox" name={`line-${line.id}`} className="size-5 accent-foreground" />
                {line.title} · EUR {line.size.eu}
              </label>
            ))}
          <label htmlFor={`${id}-reason`} className="text-16 font-bold md:text-18">
            What&rsquo;s wrong?
          </label>
          <textarea
            id={`${id}-reason`}
            name="reason"
            rows={3}
            maxLength={500}
            className="w-full resize-y rounded-lg border-2 border-control-border px-4 py-3 text-18 hover:border-foreground focus-visible:border-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <button type="submit" disabled={requestReturn.isPending} className={cn(action, "bg-foreground text-background hover:bg-brand hover:text-brand-foreground")}>
            {requestReturn.isPending ? "Sending…" : "Send return request"}
          </button>
          <p className="text-14 text-subtle-foreground md:text-16">
            See our{" "}
            <Link href="/returns" className="underline underline-offset-4">
              returns policy
            </Link>
            .
          </p>
        </form>
      ) : null}

      <p role="alert" className="text-16 font-medium text-destructive empty:hidden">
        {error}
      </p>
      <Link href="/" className={cn(action, "bg-brand text-brand-foreground hover:bg-foreground hover:text-brand")}>
        Continue Shopping
      </Link>
      <Link href="/contact" className="min-h-11 content-center text-center text-16 font-semibold underline-offset-4 hover:underline md:text-18">
        Need help with this order?
      </Link>
    </div>
  )
}
