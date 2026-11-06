import Link from "next/link"

import {
  CheckIcon,
  DeliveryIcon,
  ReturnIcon,
  SecureIcon,
  WhatsappIcon,
} from "@/components/icons"
import type { FreeDeliveryProgress } from "@/features/cart/lib/free-delivery"
import { formatPrice } from "@/lib/format"
import { siteConfig } from "@/lib/site"
import { cn } from "@/lib/utils"
import type { Cart } from "@/server/cart/types"

/** The bag's free-delivery bar (D-059): how much more unlocks free delivery, or that it is unlocked. */
export function FreeDeliveryBar({
  progress,
  currency,
}: {
  progress: FreeDeliveryProgress
  currency: Cart["currency"]
}) {
  const price = (amount: number) =>
    formatPrice(amount, currency, { symbol: true })
  const unlocked = progress.remaining === 0
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl p-4 md:p-5",
        unlocked
          ? "bg-brand-tint"
          : "bg-background outline-1 outline-border-strong"
      )}
    >
      <p className="flex items-center gap-3 text-16 font-semibold md:text-18">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            unlocked
              ? "bg-foreground text-brand"
              : "bg-surface-sunken text-foreground"
          )}
        >
          {unlocked ? (
            <CheckIcon aria-hidden="true" className="size-3.5" />
          ) : (
            <DeliveryIcon aria-hidden="true" className="size-4.5" />
          )}
        </span>
        {unlocked ? (
          "You've unlocked free delivery."
        ) : (
          <span>
            Add{" "}
            <strong className="font-bold">{price(progress.remaining)}</strong>{" "}
            more for free delivery.
          </span>
        )}
      </p>
      <div
        role="progressbar"
        aria-label="Progress to free delivery"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress.ratio * 100)}
        className="h-2.5 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className="h-full origin-left rounded-full bg-success transition-transform motion-reduce:transition-none rtl:origin-right"
          style={{ transform: `scaleX(${progress.ratio})` }}
        />
      </div>
      <p className="text-14 text-subtle-foreground">
        Free delivery on orders above {price(progress.threshold)}.
      </p>
    </div>
  )
}

/** Shown when the bag holds a pre-loved pair: they're one of a kind and not held while in the bag. */
export function PreLovedNote() {
  return (
    <aside className="flex flex-col gap-1 rounded-xl border-s-4 border-foreground bg-background px-5 py-4">
      <p className="text-16 font-bold md:text-18">
        Pre-loved pairs are one of a kind
      </p>
      <p className="text-16 text-subtle-foreground">
        They aren&apos;t reserved while they sit in your bag, so check out soon
        to make one yours. Every grade is explained in the{" "}
        <Link
          href="/condition-guide"
          className="font-semibold text-foreground underline underline-offset-4 hover:text-subtle-foreground"
        >
          Condition Guide
        </Link>
        .
      </p>
    </aside>
  )
}

const help = [
  {
    Icon: DeliveryIcon,
    title: "Delivery across Pakistan",
    text: "Charges and timing, before you pay.",
    href: "/shipping",
    label: "Shipping & Delivery Policy",
  },
  {
    Icon: ReturnIcon,
    title: "7-day returns",
    text: "For Brand New and Pre-Loved pairs.",
    href: "/returns",
    label: "Returns policy",
  },
  {
    Icon: SecureIcon,
    title: "Secure checkout",
    text: "Cash on Delivery and the options shown at checkout.",
    href: "/terms#payments",
    label: "Payment terms",
  },
] as const

/** The row under the bag (D-059): where delivery, returns and payment are explained, and a way to ask. */
export function BagHelp() {
  const card =
    "group flex h-full items-start gap-4 rounded-xl bg-background p-5 outline-1 outline-border-strong transition-colors hover:outline-foreground"
  const icon =
    "flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground text-brand"
  return (
    <section aria-labelledby="bag-help-title" className="flex flex-col gap-4">
      <h2
        id="bag-help-title"
        className="text-20 font-extrabold uppercase md:text-24"
      >
        Good to know
      </h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {help.map(({ Icon, title, text, href, label }) => (
          <li key={title}>
            <Link href={href} className={card}>
              <span className={icon}>
                <Icon aria-hidden="true" className="size-6" />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-18 font-bold">{title}</span>
                <span className="text-16 text-subtle-foreground">{text}</span>
                <span className="pt-1 text-14 font-bold underline underline-offset-4 group-hover:text-subtle-foreground">
                  {label}
                </span>
              </span>
            </Link>
          </li>
        ))}
        <li>
          <a
            href={siteConfig.contact.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className={card}
          >
            <span className={icon}>
              <WhatsappIcon aria-hidden="true" className="size-6" />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-18 font-bold">Need help choosing?</span>
              <span className="text-16 text-subtle-foreground">
                Ask about sizing or condition before you order.
              </span>
              <span className="pt-1 text-14 font-bold underline underline-offset-4 group-hover:text-subtle-foreground">
                Chat on WhatsApp
                <span className="sr-only"> (opens in a new tab)</span>
              </span>
            </span>
          </a>
        </li>
      </ul>
    </section>
  )
}
