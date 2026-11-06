import { DeliveryIcon, ReturnIcon, SecureIcon } from "@/components/icons"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * Secure checkout · Free delivery · Easy returns, under the product page's buttons. The delivery
 * threshold comes from the shipping rates so the promise always matches what checkout charges.
 */
export function TrustRow({
  freeDeliveryOver,
}: {
  freeDeliveryOver: number | null
}) {
  const items = [
    {
      Icon: SecureIcon,
      title: "Secure checkout",
      text: "Protected Payments",
      iconClass: "h-12 md:h-15",
      textGap: "md:pt-2.5",
    },
    freeDeliveryOver
      ? {
          Icon: DeliveryIcon,
          title: "Free delivery",
          text: `Orders above ${formatPrice(freeDeliveryOver, "PKR", { symbol: true })}`,
          iconClass: "h-12 md:h-15",
          textGap: "md:pt-2.5",
        }
      : {
          Icon: DeliveryIcon,
          title: "Nationwide delivery",
          text: "Tracked courier",
          iconClass: "h-12 md:h-15",
          textGap: "md:pt-2.5",
        },
    {
      Icon: ReturnIcon,
      title: "Easy returns",
      text: "7-day policy",
      iconClass: "h-13 md:h-16.25",
      textGap: "md:pt-2.75",
      subGap: "md:pt-2.75",
      end: "md:pb-0.25",
    },
  ]

  return (
    <ul className="grid grid-cols-3 items-start gap-2 md:flex md:items-end md:justify-between md:gap-4">
      {items.map(({ Icon, title, text, iconClass, textGap, subGap, end }) => (
        <li
          key={title}
          className={cn("flex flex-col items-center text-center", end)}
        >
          <Icon className={cn("w-auto", iconClass)} />
          <p
            className={cn(
              "pt-2 text-14 font-bold uppercase md:text-22",
              textGap
            )}
          >
            {title}
          </p>
          <p
            className={cn(
              "pt-1 text-14 font-medium text-faint-foreground md:text-22",
              subGap ?? "md:pt-2"
            )}
          >
            {text}
          </p>
        </li>
      ))}
    </ul>
  )
}
