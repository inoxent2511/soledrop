import { createHash } from "node:crypto"
import type { Order, Payment, Refund } from "./types"
import { DomainError } from "@/server/shared/errors"
import { newId, now } from "@/server/shared/ids"

export type RefundInput = Omit<Refund, "id" | "createdAt" | "paymentId">
export type RefundIntent = {
  id: string; storeId: string; orderId: string; paymentId: string | null
  idempotencyKey: string; providerKey: string; provider: string | null; providerRef: string | null
  providerRefundRef: string | null; status: "prepared" | "provider_confirmed" | "completed"
  request: RefundInput; createdAt: string
}

function normalized(input: RefundInput): RefundInput {
  const lines = new Map<string, number>()
  for (const line of input.lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw new DomainError("validation", "Invalid refund quantity.")
    const quantity = (lines.get(line.orderLineId) ?? 0) + line.quantity
    if (!Number.isSafeInteger(quantity)) throw new DomainError("validation", "Invalid refund quantity.")
    lines.set(line.orderLineId, quantity)
  }
  return { orderId: input.orderId, amount: input.amount, reason: input.reason, restock: input.restock, idempotencyKey: input.idempotencyKey, lines: [...lines].sort(([a], [b]) => a.localeCompare(b)).map(([orderLineId, quantity]) => ({ orderLineId, quantity })) }
}

export function assertRefundReplay(previous: RefundInput, input: RefundInput): void {
  if (JSON.stringify(normalized(previous)) !== JSON.stringify(normalized(input))) throw new DomainError("conflict", "This refund key already belongs to a different request.")
}

/** A pending provider call reserves money and units until explicitly reconciled. */
export function assertRefundCapacity(order: Pick<Order, "total" | "refundedTotal" | "lines">, payments: Payment[], pending: RefundIntent[], input: RefundInput & { paymentId: string | null }): void {
  const others = pending.filter((row) => row.status !== "completed" && row.idempotencyKey !== input.idempotencyKey)
  const paid = payments.filter((row) => ["captured", "partially_refunded", "refunded"].includes(row.status)).reduce((sum, row) => sum + row.amount, 0)
  const reserved = others.reduce((sum, row) => sum + row.request.amount, 0)
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || order.refundedTotal + reserved + input.amount > Math.min(paid, order.total)) throw new DomainError("validation", "Refund exceeds the amount paid or reserved for another refund.")
  const target = payments.find((row) => row.id === input.paymentId)
  if (input.paymentId && (!target || target.refundedAmount + others.filter((row) => row.paymentId === input.paymentId).reduce((sum, row) => sum + row.request.amount, 0) + input.amount > target.amount)) throw new DomainError("validation", "Refund exceeds the amount paid.")
  for (const item of normalized(input).lines) {
    const line = order.lines.find((row) => row.id === item.orderLineId)
    const reservedQuantity = others.flatMap((row) => row.request.lines).filter((row) => row.orderLineId === item.orderLineId).reduce((sum, row) => sum + row.quantity, 0)
    if (!line || line.refundedQuantity + reservedQuantity + item.quantity > line.quantity) throw new DomainError("validation", "Refund quantity exceeds the quantity bought or reserved.")
  }
}

export function prepareRefundIntent(order: Order, payments: Payment[], pending: RefundIntent[], input: RefundInput): RefundIntent {
  const payment = payments.find((row) => row.status === "captured" || row.status === "partially_refunded") ?? null
  assertRefundCapacity(order, payments, pending, { ...input, paymentId: payment?.id ?? null })
  return { id: newId(), storeId: order.storeId, orderId: order.id, paymentId: payment?.id ?? null, idempotencyKey: input.idempotencyKey,
    providerKey: createHash("sha256").update(JSON.stringify([order.storeId, order.id, input.idempotencyKey])).digest("hex"),
    provider: payment?.provider ?? null, providerRef: payment?.providerRef ?? null, providerRefundRef: null, status: "prepared", request: normalized(input), createdAt: now() }
}
