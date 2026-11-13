import { StatusPill, type StatusTone } from "@/components/admin/status-pill"
import type { OrderStatus, PaymentStatus } from "@/server/orders/types"

/** Staff wording for order and payment states (status by colour and word, admin-design.md §4). */
export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: StatusTone }> = {
  pending_payment: { label: "Awaiting payment", tone: "pending" },
  confirmed: { label: "To pack", tone: "info" },
  processing: { label: "Packing", tone: "info" },
  shipped: { label: "Shipped", tone: "neutral" },
  delivered: { label: "Delivered", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
  returned: { label: "Returned", tone: "neutral" },
}

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: StatusTone }> = {
  unpaid: { label: "Unpaid", tone: "pending" },
  authorized: { label: "Authorised", tone: "pending" },
  paid: { label: "Paid", tone: "success" },
  partially_refunded: { label: "Part refunded", tone: "neutral" },
  refunded: { label: "Refunded", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
}

export const PAYMENT_METHOD: Record<string, string> = { cod: "Cash on delivery", cash: "Cash in store", bank_transfer: "Bank transfer", card: "Card" }

/** The action verb for moving an order to a status. */
export const TRANSITION_VERB: Record<OrderStatus, string> = {
  pending_payment: "Mark awaiting payment",
  confirmed: "Confirm",
  processing: "Start packing",
  shipped: "Mark shipped",
  delivered: "Mark delivered",
  cancelled: "Cancel order",
  returned: "Mark returned",
}

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  return <StatusPill tone={ORDER_STATUS[status].tone}>{ORDER_STATUS[status].label}</StatusPill>
}

export function PaymentStatusPill({ status }: { status: PaymentStatus }) {
  return <StatusPill tone={PAYMENT_STATUS[status].tone}>{PAYMENT_STATUS[status].label}</StatusPill>
}
