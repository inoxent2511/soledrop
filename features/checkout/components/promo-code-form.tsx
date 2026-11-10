"use client"

import { useId, useState, type FormEvent } from "react"

import { ApiError } from "@/api/http"
import { useApplyCode, useRemoveCode } from "@/hooks/api/cart/useCartMutations"
import { useHydrated } from "@/hooks/use-hydrated"
import type { Cart } from "@/server/cart/types"

/**
 * Promotion codes (D-029: entered at checkout). Applied codes are listed with a Remove button;
 * a code the rules reject is reported with the server's reason. `onChange` re-quotes the totals.
 */
export function PromoCodeForm({ cart, onChange }: { cart: Cart; onChange: () => void }) {
  const id = useId()
  const hydrated = useHydrated()
  const apply = useApplyCode()
  const remove = useRemoveCode()
  const [error, setError] = useState<string | null>(null)
  const applied = cart.promotions.filter((promotion) => promotion.code)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const code = String(new FormData(form).get("code") ?? "").trim().toUpperCase()
    if (!code) {
      setError("Enter a code")
      return
    }
    setError(null)
    apply.mutate(code, {
      onSuccess: ({ cart: next }) => {
        const rejected = next.rejectedCodes.find((item) => item.code === code)
        if (rejected) setError(rejected.reason)
        else form.reset()
        onChange()
      },
      onError: (failure) => setError(failure instanceof ApiError ? failure.message : "We couldn't check that code. Please try again."),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <form method="post" noValidate onSubmit={onSubmit} className="flex flex-col gap-2">
        <label htmlFor={`${id}-code`} className="text-16 font-bold md:text-18">
          Promotion code
        </label>
        <div className="flex gap-3">
          <input
            id={`${id}-code`}
            name="code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className="h-13 min-w-0 flex-1 rounded-lg border-2 border-control-border bg-background px-4 text-18 uppercase transition-colors hover:border-foreground focus-visible:border-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive"
          />
          <button
            type="submit"
            disabled={!hydrated || apply.isPending}
            className="h-13 shrink-0 rounded-lg border-2 border-foreground px-5 text-16 font-bold uppercase transition-colors hover:bg-foreground hover:text-background disabled:opacity-50"
          >
            {apply.isPending ? "Checking…" : "Apply"}
          </button>
        </div>
        <p id={`${id}-error`} role="status" className="text-16 font-medium text-destructive empty:hidden">
          {error}
        </p>
      </form>
      {applied.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {applied.map((promotion) => (
            <li key={promotion.code} className="flex items-center justify-between gap-3 rounded-lg bg-brand-tint px-4 py-2.5 text-16 font-semibold">
              <span>
                {promotion.code} <span className="font-medium text-subtle-foreground">· {promotion.title}</span>
              </span>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(promotion.code as string, { onSuccess: onChange })}
                aria-label={`Remove code ${promotion.code}`}
                className="min-h-11 shrink-0 px-2 text-16 font-semibold text-destructive hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
