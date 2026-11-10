"use client"

import { Dialog } from "@base-ui/react/dialog"
import { useQueryClient } from "@tanstack/react-query"
import { MinusIcon, PlusIcon, XIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useId, useState, type FormEvent } from "react"

import { BagIcon } from "@/components/icons"
import { buttonVariants } from "@/components/ui/button-variants"
import { cartKeys, useCart } from "@/hooks/api/cart/queries"
import { freeDeliveryProgress } from "@/features/cart/lib/free-delivery"
import { useApplyCode, useOptimisticLine, useRemoveCode } from "@/hooks/api/cart/useCartMutations"
import { useRouteState } from "@/hooks/use-route-state"
import { conditionLabel, formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"

const stepButton = "flex size-9 items-center justify-center rounded-full transition-colors hover:bg-surface disabled:opacity-40 disabled:hover:bg-transparent"

/**
 * Header bag control (derived, D-040). Without JavaScript it is the /cart link; with it, a drawer
 * from the end edge: lines with quantity and remove (applied at once, rolled back if the server
 * refuses), free-delivery progress, promo code, subtotal, Checkout and View bag. Opening it
 * re-reads the bag from the server so prices and stock are current.
 */
export function MiniCart({ className }: { className: string }) {
  const [open, setOpen] = useRouteState(false)
  const [announcement, setAnnouncement] = useState("")
  const client = useQueryClient()
  const { data, isFetching } = useCart()
  const line = useOptimisticLine()
  const applyCode = useApplyCode()
  const removeCode = useRemoveCode()
  const codeId = useId()
  const cart = data?.cart
  const count = cart?.itemCount ?? 0
  const label = count === 0 ? "Bag, empty" : `Bag, ${count} ${count === 1 ? "item" : "items"}`

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (next) client.invalidateQueries({ queryKey: cartKeys.all })
  }

  const onCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const input = new FormData(event.currentTarget).get("code")
    const code = typeof input === "string" ? input.trim() : ""
    if (!code) return
    applyCode.mutate(code, { onSuccess: () => setAnnouncement(`Code ${code.toUpperCase()} applied.`) })
  }

  const price = (amount: number) => formatPrice(amount, cart?.currency ?? "PKR", { symbol: true })
  const progress = cart ? freeDeliveryProgress(cart) : null
  const pending = line.isPending || applyCode.isPending || removeCode.isPending
  const codes = (cart?.promotions ?? []).flatMap((promotion) => (promotion.code ? [{ ...promotion, code: promotion.code }] : []))

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger nativeButton={false} render={<Link href="/cart" onClick={(event) => event.preventDefault()} />} aria-label={label} className={cn(className, "3xl:pt-0")}>
        <BagIcon />
        {count > 0 ? (
          <span aria-hidden="true" className="absolute -top-1.5 -end-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-badge leading-0 font-bold text-brand-foreground">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-overlay bg-foreground/60 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed inset-y-0 end-0 z-overlay flex w-full max-w-md flex-col bg-background text-foreground transition-transform duration-200 ease-out data-ending-style:translate-x-full data-starting-style:translate-x-full rtl:data-ending-style:-translate-x-full rtl:data-starting-style:-translate-x-full">
          <div className="flex items-center justify-between gap-4 border-b border-border ps-5 pe-2 pt-[env(safe-area-inset-top)]">
            <Dialog.Title className="flex min-h-16 items-center text-22 font-extrabold uppercase">
              Your bag{count > 0 ? ` (${count})` : ""}
            </Dialog.Title>
            <Dialog.Close aria-label="Close bag" className="flex size-11 items-center justify-center">
              <XIcon aria-hidden="true" className="size-6" />
            </Dialog.Close>
          </div>
          <p role="status" className="sr-only">
            {announcement}
          </p>

          {!cart ? (
            <div aria-busy="true" className="flex flex-col gap-4 p-5">
              {[0, 1].map((key) => (
                <div key={key} className="flex gap-4">
                  <span className="size-20 animate-pulse rounded-lg bg-surface-sunken" />
                  <span className="flex flex-1 flex-col gap-2">
                    <span className="h-5 w-3/4 animate-pulse rounded-xs bg-surface-sunken" />
                    <span className="h-5 w-1/3 animate-pulse rounded-xs bg-surface-sunken" />
                  </span>
                </div>
              ))}
            </div>
          ) : cart.lines.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
              <BagIcon className="size-12" />
              <p className="text-22 font-extrabold uppercase">Your bag is empty</p>
              <p className="text-16 text-subtle-foreground">New drops land every week — find your next pair.</p>
              <Dialog.Close nativeButton={false} render={<Link href="/new-arrivals" />} className={buttonVariants({ tone: "brand", size: "card" })}>
                Shop new arrivals
              </Dialog.Close>
            </div>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 py-5">
                {progress ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-16 font-semibold">{progress.remaining === 0 ? "You've unlocked free delivery." : `Add ${price(progress.remaining)} more for free delivery.`}</p>
                    <div role="progressbar" aria-label="Progress to free delivery" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.ratio * 100)} className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                      <div className="h-full origin-left rounded-full bg-success transition-transform rtl:origin-right" style={{ transform: `scaleX(${progress.ratio})` }} />
                    </div>
                  </div>
                ) : null}

                {line.isError ? (
                  <p role="alert" className="rounded-lg border-2 border-destructive px-4 py-3 text-16 font-medium text-destructive">
                    {line.error.message || "We couldn't update your bag. Please try again."}
                  </p>
                ) : null}

                <ul className="flex flex-col divide-y divide-border">
                  {cart.lines.map((item) => (
                    <li key={item.id} className="flex gap-4 py-4 first:pt-0">
                      <Link href={`/products/${item.slug}`} tabIndex={-1} aria-hidden="true" className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-well">
                        <Image src={item.image.url} alt="" fill sizes="80px" className="object-cover" />
                      </Link>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <Link href={`/products/${item.slug}`} className="line-clamp-2 text-16 font-semibold hover:underline">
                          {item.title}
                        </Link>
                        <p className="text-14 text-subtle-foreground">
                          EUR {item.size.eu}
                          {item.condition ? ` · ${conditionLabel(item.condition)}` : ""}
                        </p>
                        {!item.available ? <p className="text-14 font-semibold text-destructive">Sold out — remove to check out</p> : null}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          {item.kind === "preloved" ? (
                            <span className="text-14 text-subtle-foreground">One of a kind</span>
                          ) : (
                            <div role="group" aria-label={`Quantity of ${item.title}`} className="flex items-center rounded-full border-2 border-border-strong">
                              <button
                                type="button"
                                aria-label="Decrease quantity"
                                disabled={line.isPending || item.quantity <= 1}
                                onClick={() => line.mutate({ lineId: item.id, quantity: item.quantity - 1 }, { onSuccess: () => setAnnouncement(`${item.title}: quantity ${item.quantity - 1}.`) })}
                                className={stepButton}
                              >
                                <MinusIcon aria-hidden="true" className="size-4" />
                              </button>
                              <span aria-live="polite" className="w-7 text-center text-16 font-semibold">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                aria-label="Increase quantity"
                                disabled={line.isPending || item.quantity >= item.maxQuantity}
                                onClick={() => line.mutate({ lineId: item.id, quantity: item.quantity + 1 }, { onSuccess: () => setAnnouncement(`${item.title}: quantity ${item.quantity + 1}.`) })}
                                className={stepButton}
                              >
                                <PlusIcon aria-hidden="true" className="size-4" />
                              </button>
                            </div>
                          )}
                          <span className="text-16 font-bold">{price(item.lineTotal)}</span>
                        </div>
                        <button
                          type="button"
                          disabled={line.isPending}
                          onClick={() => line.mutate({ lineId: item.id, quantity: 0 }, { onSuccess: () => setAnnouncement(`${item.title} removed from your bag.`) })}
                          aria-label={`Remove ${item.title}, size EUR ${item.size.eu}`}
                          className="w-fit text-14 font-semibold text-destructive underline-offset-4 hover:underline disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                <form method="post" onSubmit={onCode} className="flex flex-col gap-2">
                  <label htmlFor={codeId} className="text-14 font-bold tracking-wide-2 uppercase">
                    Promo code
                  </label>
                  <div className="flex gap-2">
                    <input
                      id={codeId}
                      name="code"
                      autoComplete="off"
                      maxLength={40}
                      aria-invalid={applyCode.isError || undefined}
                      aria-describedby={applyCode.isError ? `${codeId}-error` : undefined}
                      className="h-11 min-w-0 flex-1 rounded-md border-2 border-control-border px-3 text-16 uppercase focus-visible:border-foreground"
                    />
                    <button type="submit" disabled={applyCode.isPending} className={cn(buttonVariants({ tone: "outline", size: "card" }), "h-11")}>
                      {applyCode.isPending ? "Applying…" : "Apply"}
                    </button>
                  </div>
                  {applyCode.isError ? (
                    <p id={`${codeId}-error`} role="alert" className="text-14 text-destructive">
                      {applyCode.error.message}
                    </p>
                  ) : null}
                  {codes.length > 0 ? (
                    <ul className="flex flex-wrap gap-2">
                      {codes.map((promotion) => (
                        <li key={promotion.code}>
                          <button
                            type="button"
                            onClick={() => removeCode.mutate(promotion.code)}
                            aria-label={`Remove code ${promotion.code}`}
                            className="flex h-8 items-center gap-1 rounded-full bg-brand px-3 text-14 font-bold text-brand-foreground"
                          >
                            {promotion.code}
                            <XIcon aria-hidden="true" className="size-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </form>
              </div>

              <div className="flex flex-col gap-3 border-t border-border px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <p className="flex items-center justify-between text-18 font-extrabold">
                  <span>Subtotal</span>
                  <span aria-busy={pending || isFetching}>{pending ? <span className="text-subtle-foreground">Updating…</span> : price(cart.totals.subtotal - cart.totals.discount)}</span>
                </p>
                <p className="text-14 text-subtle-foreground">Delivery is calculated at checkout.</p>
                <Link href="/checkout" aria-disabled={pending || cart.lines.some((item) => !item.available) || undefined} className={cn(buttonVariants({ tone: "brand", size: "md" }), "w-full rounded-lg")}>
                  Checkout
                </Link>
                <Link href="/cart" className={cn(buttonVariants({ tone: "outline", size: "card" }), "w-full")}>
                  View bag
                </Link>
              </div>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
