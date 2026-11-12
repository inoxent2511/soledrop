"use client"

import { useEffect, useId, useState } from "react"

import { ApiError } from "@/api/http"
import { buttonVariants } from "@/components/ui/button-variants"
import type { CardProduct } from "@/features/catalog/types/card"
import { useAddToCart } from "@/hooks/api/cart/useCartMutations"
import { cn } from "@/lib/utils"

/**
 * Size chips + ADD TO CART on new-product cards. The design shows both on the card, so the shopper
 * picks a size there; pressing add without one points them at the chips instead of guessing
 * (journey-audit J-03). Sold-out sizes stay visible but can't be chosen.
 */
export function QuickAdd({ product }: { product: CardProduct }) {
  const id = useId()
  const [variantId, setVariantId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null)
  const add = useAddToCart()

  useEffect(() => {
    if (message?.tone !== "ok") return
    const timer = setTimeout(() => setMessage(null), 2500)
    return () => clearTimeout(timer)
  }, [message])

  function onAdd() {
    if (!variantId) {
      setMessage({ tone: "error", text: "Please choose a size first." })
      document.getElementById(`${id}-${product.sizes.find((size) => size.available)?.variantId}`)?.focus()
      return
    }
    add.mutate(
      { variantId },
      {
        onSuccess: () => setMessage({ tone: "ok", text: "Added to your bag" }),
        onError: (error) => setMessage({ tone: "error", text: error instanceof ApiError ? error.message : "Couldn't add this pair. Try again." }),
      },
    )
  }

  const soldOut = !product.inStock
  const error = message?.tone === "error" ? message.text : null

  return (
    <>
      <fieldset className="flex min-h-10 flex-col gap-2" aria-describedby={error ? `${id}-error` : undefined}>
        <legend className="sr-only">Size (EU) for {product.title}</legend>
        <div className="flex flex-wrap gap-2.5">
          {product.sizes.map((size) => (
            <label key={size.variantId} className={cn("relative", !size.available && "cursor-not-allowed")}>
              <input
                id={`${id}-${size.variantId}`}
                type="radio"
                name={`${id}-size`}
                value={size.variantId}
                disabled={!size.available}
                checked={variantId === size.variantId}
                onChange={() => {
                  setVariantId(size.variantId)
                  setMessage(null)
                }}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex h-10 w-11 cursor-pointer items-center justify-center rounded-xs outline-[1.5px] outline-border-strong text-20 leading-0 font-semibold tracking-tight-1 transition-colors",
                  "peer-hover:outline-foreground peer-checked:outline-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
                  "peer-disabled:cursor-not-allowed peer-disabled:outline-border peer-disabled:text-faint-foreground peer-disabled:line-through",
                )}
              >
                {size.eu}
                {size.available ? null : <span className="sr-only"> (sold out)</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error ? (
        <p id={`${id}-error`} role="alert" className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-14 leading-5 font-semibold text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <button
          type="button"
          onClick={onAdd}
          disabled={soldOut || add.isPending}
          className={cn(buttonVariants({ tone: "brand", size: "card" }), "w-full")}
        >
          {soldOut ? "Sold out" : add.isPending ? "Adding…" : message?.tone === "ok" ? "Added ✓" : "Add to cart"}
          <span className="sr-only">: {product.title}</span>
        </button>
        <p role="status" aria-live="polite" className="sr-only">{message?.tone === "ok" ? message.text : ""}</p>
      </div>
    </>
  )
}
