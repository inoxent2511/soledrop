import type { PaymentProvider } from "@/server/adapters/payments/types"
import { DomainError } from "@/server/shared/errors"
import type { RefundIntent } from "./refund-intent"

/** Never create another external refund after the provider's idempotency retention window. */
export async function settleRefundProvider(intent: RefundIntent, provider: PaymentProvider | undefined, readOnly = false): Promise<string | null> {
  if ((!intent.provider || ["cod", "bank_transfer"].includes(intent.provider)) && !provider?.refund) return null
  if (!intent.providerRef || !provider?.refund) throw new DomainError("unavailable", "The original payment provider is unavailable. Reconcile the pending refund before proceeding.")
  const existing = await provider.lookupRefund?.(intent.providerRef, intent.providerKey)
  if (existing) {
    if (existing.amount !== intent.request.amount || existing.status !== "succeeded") throw new DomainError("unavailable", "The provider refund is pending or needs reconciliation. No additional refund was sent.")
    return existing.providerRef
  }
  // Stripe API v1 retains keys for at least 24 h. Leave an hour of margin; an older uncertain
  // intent can only recover from a read-only provider result, never another POST.
  const age = Date.now() - Date.parse(intent.createdAt)
  if (readOnly || !Number.isFinite(age) || age < -30_000 || age >= 23 * 3_600_000) throw new DomainError("unavailable", "This pending refund requires provider reconciliation before it can proceed.")
  return (await provider.refund(intent.providerRef, intent.request.amount, intent.providerKey)).providerRef
}
