import { DeliveryIcon } from "@/components/icons"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { DeliveryRate } from "@/server/storefront"

/**
 * The store's live delivery rates under "Delivery charges" (D-056): the same rates checkout charges,
 * read at render time, so the policy and the bag can never disagree. Delivery days are left to checkout.
 */
export function DeliveryRates({ rates }: { rates: DeliveryRate[] }) {
  if (rates.length === 0) return null
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-14 font-bold tracking-wide-2 text-faint-foreground uppercase">
        Delivery rates today
      </h3>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rates.map((rate, index) => (
          <li
            key={rate.code}
            className={cn(
              "flex flex-col gap-4 rounded-xl p-5 md:p-6",
              index === 0
                ? "bg-foreground text-background"
                : "border border-border bg-surface"
            )}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <span className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-full",
                    index === 0
                      ? "bg-brand text-brand-foreground"
                      : "bg-foreground text-brand"
                  )}
                >
                  <DeliveryIcon aria-hidden="true" className="size-5" />
                </span>
                <span className="min-w-0 text-18 leading-tight font-extrabold wrap-break-word">
                  {rate.label}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 font-display text-22 font-bold md:text-26",
                  index === 0 && "text-brand"
                )}
              >
                {rate.amount === 0 ? "Free" : formatPrice(rate.amount, "PKR", { symbol: true })}
              </span>
            </div>
            <ul className="flex flex-wrap gap-2">
              {rate.freeOver !== null && rate.amount > 0 ? (
                <li
                  className={cn(
                    "rounded-full px-3 py-1 text-14 font-bold",
                    index === 0
                      ? "bg-brand text-brand-foreground"
                      : "bg-brand-tint"
                  )}
                >
                  Free above {formatPrice(rate.freeOver, "PKR", { symbol: true })}
                </li>
              ) : null}
              {rate.cashOnDelivery ? (
                <li
                  className={cn(
                    "rounded-full border px-3 py-1 text-14 font-bold",
                    index === 0
                      ? "border-muted-foreground"
                      : "border-foreground bg-background"
                  )}
                >
                  Cash on Delivery
                </li>
              ) : null}
            </ul>
          </li>
        ))}
      </ul>
      <p className="text-14 text-subtle-foreground">
        As charged at checkout. Your exact total is shown before you confirm.
      </p>
    </div>
  )
}
