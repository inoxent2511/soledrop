import { afterEach, describe, expect, it, vi } from "vitest"
import { createStripeProvider } from "@/server/adapters/payments/stripe"
import type { PaymentProvider } from "@/server/adapters/payments/types"
import { settleRefundProvider } from "@/server/orders/provider-refund"
import type { RefundIntent } from "@/server/orders/refund-intent"

const intent = (): RefundIntent => ({ id: crypto.randomUUID(), storeId: crypto.randomUUID(), orderId: "order", paymentId: "payment", idempotencyKey: "request", providerKey: "a".repeat(64), provider: "stripe", providerRef: "cs_test123", providerRefundRef: null, status: "prepared", request: { orderId: "order", amount: 10000, reason: "Fit", lines: [], restock: false, idempotencyKey: "request" }, createdAt: new Date().toISOString() })
const provider = (): PaymentProvider => ({ code: "fake", label: "Fake", description: "Local", isAvailable: async () => true, createPayment: async () => { throw new Error("Unused") }, refund: vi.fn(async () => ({ providerRef: "re_test" })) })
afterEach(() => { vi.unstubAllGlobals() })

describe("provider refund recovery", () => {
  it("never posts an old uncertain intent after idempotency retention may expire", async () => {
    const pending = { ...intent(), createdAt: new Date(Date.now() - 24 * 3_600_000).toISOString() }, p = provider()
    await expect(settleRefundProvider(pending, p)).rejects.toMatchObject({ code: "unavailable" })
    expect(p.refund).not.toHaveBeenCalled()
    p.lookupRefund = async () => ({ providerRef: "re_existing", amount: 10000, status: "succeeded" })
    expect(await settleRefundProvider(pending, p)).toBe("re_existing")
    expect(p.refund).not.toHaveBeenCalled()
  })
  it.each(["pending", "requires_action", "failed", "canceled"])("keeps %s money reserved without another provider POST", async (status) => {
    const p = provider(); p.lookupRefund = async () => ({ providerRef: "re_existing", amount: 10000, status })
    await expect(settleRefundProvider(intent(), p)).rejects.toMatchObject({ code: "unavailable" })
    expect(p.refund).not.toHaveBeenCalled()
  })
  it("rejects a mismatched amount or unavailable original provider", async () => {
    const p = provider(); p.lookupRefund = async () => ({ providerRef: "re_existing", amount: 9999, status: "succeeded" })
    await expect(settleRefundProvider(intent(), p)).rejects.toMatchObject({ code: "unavailable" })
    await expect(settleRefundProvider(intent(), undefined)).rejects.toMatchObject({ code: "unavailable" })
    await expect(settleRefundProvider({ ...intent(), providerRef: null }, p)).rejects.toMatchObject({ code: "unavailable" })
    expect(p.refund).not.toHaveBeenCalled()
  })
  it("keeps operational reconciliation read-only even for a recent intent", async () => {
    const p = provider(); p.lookupRefund = async () => null
    await expect(settleRefundProvider(intent(), p, true)).rejects.toMatchObject({ code: "unavailable" })
    expect(p.refund).not.toHaveBeenCalled()
  })
  it("finds the exact Stripe refund through paginated read-only lookup", async () => {
    const pending = intent(), urls: URL[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal)
      expect(init.method).toBeUndefined()
      urls.push(new URL(url))
      if (url.includes("checkout/sessions/")) return Response.json({ payment_intent: "pi_test123" })
      return urls.length === 2 ? Response.json({ has_more: true, data: [{ id: "re_other", metadata: {} }] }) : Response.json({ has_more: false, data: [{ id: "re_saved", amount: 10000, status: "succeeded", metadata: { soledrop_refund_key: pending.providerKey } }] })
    }))
    const stripe = createStripeProvider({ secretKey: "fake-no-network", enabled: async () => false })
    expect(await settleRefundProvider(pending, stripe)).toBe("re_saved")
    expect(urls[2].searchParams.get("starting_after")).toBe("re_other")
    expect(urls[2].searchParams.get("payment_intent")).toBe("pi_test123")
  })
  it("sends durable metadata and does not call a pending Stripe response a completed refund", async () => {
    const requests: RequestInit[] = []
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      requests.push(init)
      return init.method === "POST" ? Response.json({ id: "re_pending", amount: 10000, status: "pending" }) : Response.json({ payment_intent: "pi_test123" })
    }))
    const stripe = createStripeProvider({ secretKey: "fake-no-network", enabled: async () => false })
    await expect(stripe.refund!("cs_test123", 10000, "durable-key")).rejects.toMatchObject({ code: "unavailable" })
    expect(new URLSearchParams(String(requests[1].body)).get("metadata[soledrop_refund_key]")).toBe("durable-key")
    expect(new Headers(requests[1].headers).get("idempotency-key")).toBe("durable-key")
  })
})
