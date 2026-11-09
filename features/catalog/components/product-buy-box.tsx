"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import { ApiError } from "@/api/http"
import { buttonVariants } from "@/components/ui/button-variants"
import { ConditionDialog } from "@/features/catalog/components/condition-dialog"
import { QuantityStepper } from "@/features/catalog/components/quantity-stepper"
import { SizePicker } from "@/features/catalog/components/size-picker"
import { useAddToCart } from "@/hooks/api/cart/useCartMutations"
import type { ConditionGrade } from "@/server/catalog/types"
import { cn } from "@/lib/utils"

const MAX_PER_ORDER = 10

export type BuyBoxSize = { variantId: string; eu: string; uk: string; us: string; stock: number }

type ProductBuyBoxProps = {
  title: string
  kind: "new" | "preloved"
  sizes: BuyBoxSize[]
  condition: ConditionGrade | null
}

/**
 * The product page's purchase controls. New pairs: EU size chips, quantity (bounded by stock) and
 * SIZE GUIDE. Pre-loved pairs are one of a kind, so the tag size and condition grade are shown as
 * facts instead of choices. ADD TO CART stays on the page; BUY NOW adds and goes to checkout.
 */
export function ProductBuyBox({ title, kind, sizes, condition }: ProductBuyBoxProps) {
  const id = useId()
  const router = useRouter()
  const preloved = kind === "preloved"
  const [variantId, setVariantId] = useState<string | null>(preloved || sizes.length === 1 ? (sizes[0]?.variantId ?? null) : null)
  const [quantity, setQuantity] = useState(1)
  const [status, setStatus] = useState<{ tone: "error" | "ok"; text: string } | null>(null)
  const add = useAddToCart()
  const selected = sizes.find((size) => size.variantId === variantId) ?? null
  const inStock = sizes.some((size) => size.stock > 0)
  const max = Math.max(1, Math.min(MAX_PER_ORDER, selected ? selected.stock : MAX_PER_ORDER))

  function submit(then: "stay" | "checkout") {
    if (!variantId) {
      setStatus({ tone: "error", text: "Choose your size first." })
      return
    }
    add.mutate(
      { variantId, quantity },
      {
        onSuccess: () => {
          if (then === "checkout") router.push("/checkout")
          else setStatus({ tone: "ok", text: `Added ${quantity} × ${title} to your bag.` })
        },
        onError: (error) => setStatus({ tone: "error", text: error instanceof ApiError ? error.message : "Couldn't add this pair. Try again." }),
      },
    )
  }

  return (
    <div className="flex flex-col">
      {preloved ? (
        <div className="flex flex-col gap-8 pt-8 3xl:gap-10.5 3xl:pt-11">
          {selected ? (
            <div className="flex flex-col items-start gap-3.5">
              <p className="text-20 font-semibold md:text-26 3xl:ps-0.25">Size</p>
              <p className="flex h-14 items-center rounded-lg bg-foreground ps-5 pe-4.75 text-22 font-semibold text-background md:h-18 md:text-30">
                <span className="sr-only">Tag size: </span>EUR {selected.eu} - UK {selected.uk} - US {selected.us}
              </p>
            </div>
          ) : null}
          {condition ? (
            <div className="flex flex-col items-start gap-3.5">
              <p className="text-20 font-semibold md:text-26">Condition</p>
              <ConditionDialog grade={condition} />
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="pt-8 3xl:pt-11.5">
            <SizePicker
              legend="Size"
              legendClassName="text-20 font-medium uppercase md:text-26"
              variant="pdp"
              options={sizes.map((size) => ({ variantId: size.variantId, label: size.eu, available: size.stock > 0 }))}
              value={variantId}
              onChange={(next) => {
                setVariantId(next)
                setQuantity(1)
                setStatus(null)
              }}
              invalid={status?.tone === "error" && !variantId}
              describedBy={`${id}-status`}
            />
          </div>
          <div className="flex flex-wrap items-end justify-between gap-6 pt-8 3xl:pt-12">
            <div className="flex flex-col gap-3.5">
              <p className="text-20 font-medium uppercase md:text-26">Quantity</p>
              <QuantityStepper value={quantity} max={max} onChange={setQuantity} disabled={!inStock} />
            </div>
            <Link href="/size-guide" className="text-20 font-bold uppercase underline underline-offset-4 hover:text-subtle-foreground md:text-26">
              Size guide
            </Link>
          </div>
        </>
      )}

      <div className={cn("flex flex-col gap-4 pt-8", preloved ? "3xl:pt-10.5" : "3xl:pt-12.25")}>
        <button
          type="button"
          onClick={() => submit("stay")}
          disabled={!inStock || add.isPending}
          className={cn(buttonVariants({ tone: "brand", size: "xl" }), "w-full")}
        >
          {!inStock ? "Sold out" : add.isPending ? "Adding…" : "Add to cart"}
        </button>
        <div className="3xl:ps-0.25">
          <button
            type="button"
            onClick={() => submit("checkout")}
            disabled={!inStock || add.isPending}
            className={cn(buttonVariants({ tone: "ink-light", size: "xl" }), "w-full 3xl:w-200")}
          >
            Buy now
          </button>
        </div>
        <p id={`${id}-status`} role="status" aria-live="polite" className={cn("text-16 font-semibold empty:hidden md:text-18", status?.tone === "ok" ? "text-success" : "text-destructive")}>
          {status ? (
            <>
              {status.text}{" "}
              {status.tone === "ok" ? (
                <Link href="/cart" className="underline underline-offset-4">
                  View bag
                </Link>
              ) : null}
            </>
          ) : null}
        </p>
      </div>
    </div>
  )
}
