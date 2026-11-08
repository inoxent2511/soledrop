import type { CurrencyCode } from "@/server/shared/money"

export type PaymentIntentInput = {
  orderId: string
  orderNumber: string
  amount: number
  currency: CurrencyCode
  email: string
  idempotencyKey: string
  returnUrl: string
}

/** What the shopper does next after placing the order. */
export type PaymentNextStep =
  | { type: "none" }
  | { type: "instructions"; title: string; lines: { label: string; value: string }[] }
  | { type: "redirect"; url: string }

export type PaymentIntentResult = {
  status: "pending" | "authorized" | "captured"
  providerRef: string | null
  next: PaymentNextStep
}

export type WebhookResult = { orderId: string; providerRef: string; status: "captured" | "failed"; amount: number } | null

/** A payment method. COD and bank transfer are built in; Stripe is the card reference adapter. */
export interface PaymentProvider {
  readonly code: string
  readonly label: string
  readonly description: string
  /** Whether the provider can be offered right now (credentials, flags). */
  isAvailable(): Promise<boolean>
  createPayment(input: PaymentIntentInput): Promise<PaymentIntentResult>
  /** Verifies a vendor webhook signature and maps it to a payment result. */
  parseWebhook?(rawBody: string, headers: Headers): Promise<WebhookResult>
  refund?(providerRef: string, amount: number, idempotencyKey: string): Promise<{ providerRef: string }>
  /** Read-only recovery for an accepted call whose response was lost. */
  lookupRefund?(providerRef: string, idempotencyKey: string): Promise<{ providerRef: string; amount: number; status: string } | null>
}
