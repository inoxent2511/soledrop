import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import type { PaymentProvider } from "@/server/adapters/payments/types"
import { DomainError } from "@/server/shared/errors"

/**
 * Stripe reference adapter (Checkout Sessions over the REST API, no SDK). Off unless
 * STRIPE_SECRET_KEY is set and the `stripe-payments` flag is on. Never runs in the browser.
 */
export function createStripeProvider(options: { secretKey?: string; webhookSecret?: string; enabled: () => Promise<boolean> }): PaymentProvider {
  const get = async (resource: string, signal: AbortSignal) => {
    if (!options.secretKey) throw new DomainError("unavailable", "Payment provider credentials are unavailable.")
    const response = await fetch("https://api.stripe.com/v1/" + resource, { headers: { authorization: "Bearer " + options.secretKey }, signal, redirect: "error" })
    if (!response.ok) throw new DomainError("unavailable", "The payment provider could not verify this refund. Try again later.")
    return await response.json() as Record<string, unknown>
  }
  const paymentIntent = async (reference: string, signal: AbortSignal) => {
    const session = await get("checkout/sessions/" + encodeURIComponent(reference), signal)
    if (typeof session.payment_intent !== "string" || !/^pi_[a-zA-Z0-9]+$/.test(session.payment_intent)) throw new DomainError("unavailable", "The original payment could not be verified.")
    return session.payment_intent
  }
  const call = async (path: string, form: Record<string, string>, idempotencyKey: string) => {
    const response = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": idempotencyKey,
      },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(15_000),
    })
    const body = (await response.json()) as Record<string, unknown>
    if (!response.ok) throw new Error(`Stripe ${path} failed: ${(body.error as { message?: string } | undefined)?.message ?? response.status}`)
    return body
  }

  return {
    code: "stripe",
    label: "Card (Visa, Mastercard)",
    description: "Pay securely by card through Stripe.",
    async isAvailable() {
      return Boolean(options.secretKey) && (await options.enabled())
    },
    async createPayment(input) {
      const session = await call(
        "checkout/sessions",
        {
          mode: "payment",
          "line_items[0][price_data][currency]": input.currency.toLowerCase(),
          "line_items[0][price_data][product_data][name]": `Sole Drop order ${input.orderNumber}`,
          "line_items[0][price_data][unit_amount]": String(input.amount),
          "line_items[0][quantity]": "1",
          customer_email: input.email,
          client_reference_id: input.orderId,
          "metadata[order_id]": input.orderId,
          success_url: `${input.returnUrl}&paid=1`,
          cancel_url: input.returnUrl,
        },
        input.idempotencyKey,
      )
      return { status: "pending", providerRef: String(session.id), next: { type: "redirect", url: String(session.url) } }
    },
    async parseWebhook(rawBody, headers) {
      const header = headers.get("stripe-signature") ?? ""
      const parts = Object.fromEntries(header.split(",").map((part) => part.split("=") as [string, string]))
      const expected = createHmac("sha256", options.webhookSecret ?? "").update(`${parts.t}.${rawBody}`).digest("hex")
      const given = Buffer.from(parts.v1 ?? "", "hex")
      if (!options.webhookSecret || given.length !== 32 || !timingSafeEqual(given, Buffer.from(expected, "hex"))) throw new Error("Invalid Stripe signature")
      if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) throw new Error("Stale Stripe webhook")
      const event = JSON.parse(rawBody) as { type: string; data: { object: { id: string; amount_total: number; metadata: { order_id: string } } } }
      if (event.type === "checkout.session.completed") {
        return { orderId: event.data.object.metadata.order_id, providerRef: event.data.object.id, status: "captured", amount: event.data.object.amount_total }
      }
      if (event.type === "checkout.session.expired") {
        return { orderId: event.data.object.metadata.order_id, providerRef: event.data.object.id, status: "failed", amount: 0 }
      }
      return null
    },
    async refund(providerRef, amount, idempotencyKey) {
      const intent = await paymentIntent(providerRef, AbortSignal.timeout(15_000))
      const refund = await call("refunds", { payment_intent: intent, amount: String(amount), "metadata[soledrop_refund_key]": idempotencyKey }, idempotencyKey)
      if (refund.status !== "succeeded" || refund.amount !== amount || typeof refund.id !== "string") throw new DomainError("unavailable", "The provider refund is pending or needs reconciliation. No additional refund was sent.")
      return { providerRef: String(refund.id) }
    },
    async lookupRefund(providerRef, key) {
      const signal = AbortSignal.timeout(15_000), intent = await paymentIntent(providerRef, signal)
      let cursor: string | undefined
      for (let page = 0; page < 10; page++) {
        const query = new URLSearchParams({ payment_intent: intent, limit: "100", ...(cursor ? { starting_after: cursor } : {}) })
        const result = await get("refunds?" + query.toString(), signal)
        if (!Array.isArray(result.data)) throw new DomainError("unavailable", "The provider refund list could not be verified.")
        for (const row of result.data as Record<string, unknown>[]) {
          const metadata = row.metadata as Record<string, unknown> | null
          if (metadata?.soledrop_refund_key === key) {
            if (typeof row.id !== "string" || typeof row.amount !== "number" || !Number.isSafeInteger(row.amount) || typeof row.status !== "string") throw new DomainError("unavailable", "The provider refund response could not be verified.")
            return { providerRef: row.id, amount: row.amount, status: row.status }
          }
        }
        if (result.has_more === false) return null
        cursor = (result.data.at(-1) as Record<string, unknown> | undefined)?.id as string | undefined
        if (!cursor) throw new DomainError("unavailable", "The provider refund list could not be verified.")
      }
      throw new DomainError("unavailable", "This refund requires manual provider reconciliation.")
    },
  }
}
