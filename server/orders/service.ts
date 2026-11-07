import "server-only"

import { createHash, createHmac, timingSafeEqual } from "node:crypto"

import type { PaymentNextStep, PaymentProvider } from "@/server/adapters/payments/types"
import type { CartService, Destination, ShopperContext } from "@/server/cart/service"
import type { CartRow } from "@/server/cart/types"
import type { CatalogService } from "@/server/catalog/service"
import { validateCustomFields } from "@/server/custom-fields/validate"
import type { OrderDraft, OrderRepository } from "@/server/orders/repository"
import { customerCanCancel, customerCanRequestReturn } from "@/server/orders/state-machine"
import type { Address, Order, OrderLine, OrderStatus } from "@/server/orders/types"
import { DomainError } from "@/server/shared/errors"
import { allocate } from "@/server/shared/money"
import { newId } from "@/server/shared/ids"

export type CheckoutInput = {
  /** Null when the cart was already converted — only valid for a replay of the same key. */
  cart: CartRow | null
  shopper: ShopperContext
  email: string
  phone: string
  address: Address
  shippingCode: string
  paymentMethod: string
  idempotencyKey: string
  customFields?: Record<string, unknown>
  note?: string
  /** Absolute URL of the order page, without the token; providers return the shopper here. */
  orderUrl: (number: string) => string
}

export type CheckoutResult = { order: Order; accessToken: string; next: PaymentNextStep; replayed: boolean }

export type OrderViewer = { customerId: string | null; token: string | null }

type Deps = {
  orders: OrderRepository
  carts: CartService
  catalog: CatalogService
  payments: { get: (code: string) => PaymentProvider | undefined; available: () => Promise<PaymentProvider[]> }
  secret: string
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex")

/** Order lines snapshot the product at the time of purchase; later catalogue edits never change them. */
function toOrderLines(priced: Awaited<ReturnType<CartService["price"]>>, tax: number): OrderLine[] {
  const lines = priced.cart.lines.filter((line) => line.available)
  const shipping = priced.cart.totals.shipping ?? 0
  const net = lines.map((line) => line.lineTotal - line.discount)
  const taxShares = allocate(tax, [...net, shipping])
  return lines.map((line, index) => {
    const variant = priced.products.get(line.variantId)?.variants.find((item) => item.id === line.variantId)
    return {
      id: newId(),
      variantId: line.variantId,
      productId: line.productId,
      slug: line.slug,
      title: line.title,
      brand: line.brand,
      kind: line.kind,
      condition: line.condition,
      size: line.size,
      imageUrl: line.image.url,
      sku: variant?.sku ?? "",
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      compareAt: line.compareAt,
      discount: line.discount,
      tax: taxShares[index] ?? 0,
      total: net[index] ?? 0,
      refundedQuantity: 0,
    }
  })
}

export function createOrderService(deps: Deps) {
  const { orders } = deps

  /** Deterministic per order, so a replayed checkout returns the same confirmation link. */
  const accessTokenFor = (idempotencyKey: string) => createHmac("sha256", deps.secret).update(`order-access:${idempotencyKey}`).digest("base64url")

  function canView(order: Order, viewer: OrderViewer): boolean {
    if (viewer.customerId && order.customerId === viewer.customerId) return true
    if (!viewer.token) return false
    const given = Buffer.from(hash(viewer.token), "hex")
    const stored = Buffer.from(order.accessTokenHash, "hex")
    return given.length === stored.length && timingSafeEqual(given, stored)
  }

  async function startPayment(order: Order, accessToken: string, provider: PaymentProvider, input: CheckoutInput): Promise<PaymentNextStep> {
    const result = await provider.createPayment({
      orderId: order.id,
      orderNumber: order.number,
      amount: order.total,
      currency: order.currency,
      email: order.email,
      idempotencyKey: `payment:${order.idempotencyKey}`,
      returnUrl: `${input.orderUrl(order.number)}?token=${accessToken}`,
    })
    await orders.recordPayment({
      orderId: order.id,
      provider: provider.code,
      status: result.status,
      amount: order.total,
      currency: order.currency,
      providerRef: result.providerRef,
      idempotencyKey: `create:${order.idempotencyKey}`,
    })
    return result.next
  }

  /**
   * What the shopper still has to do to pay (bank details, card redirect). Providers are
   * idempotent on the order key, so this never creates a second charge. Redirects are only
   * produced on request because they call the card provider.
   */
  async function nextStepFor(order: Order, accessToken: string, orderUrl: (number: string) => string, options = { includeRedirect: false }): Promise<PaymentNextStep> {
    if (order.status === "cancelled" || (order.paymentStatus !== "unpaid" && order.paymentStatus !== "failed")) return { type: "none" }
    const provider = deps.payments.get(order.paymentMethod)
    if (!provider || (provider.code === "stripe" && !options.includeRedirect)) return { type: "none" }
    const result = await provider.createPayment({
      orderId: order.id,
      orderNumber: order.number,
      amount: order.total,
      currency: order.currency,
      email: order.email,
      idempotencyKey: `payment:${order.idempotencyKey}`,
      returnUrl: `${orderUrl(order.number)}?token=${accessToken}`,
    })
    return result.next
  }

  return {
    accessTokenFor,
    canView,

    /**
     * Turns the shopper's cart into an order. Every amount is recomputed here from the
     * database; the client only sends identifiers, contact details and choices.
     */
    async checkout(input: CheckoutInput): Promise<CheckoutResult> {
      const accessToken = accessTokenFor(input.idempotencyKey)
      // A retried submit (double click, flaky network) returns the order it already created.
      const existing = await orders.findByIdempotencyKey(input.shopper.storeId, input.idempotencyKey)
      if (existing) {
        const next = await nextStepFor(existing, accessToken, input.orderUrl, { includeRedirect: true })
        return { order: existing, accessToken, next, replayed: true }
      }
      if (!input.cart) throw new DomainError("validation", "Your bag is empty.")
      const cart = input.cart
      const destination: Destination = { country: input.address.country, city: input.address.city, province: input.address.province, shippingCode: input.shippingCode }
      const priced = await deps.carts.price(cart, input.shopper, destination)
      const purchasable = priced.cart.lines.filter((line) => line.available)
      if (purchasable.length === 0) throw new DomainError("validation", "Your bag is empty.")
      if (priced.cart.warnings.length > 0) throw new DomainError("conflict", "Your bag changed — please review it before paying.", { warnings: priced.cart.warnings })
      const shipping = priced.selectedShipping
      if (!shipping || shipping.code !== input.shippingCode) throw new DomainError("validation", "That delivery option isn't available for your address.")

      const provider = deps.payments.get(input.paymentMethod)
      const available = await deps.payments.available()
      if (!provider || !available.some((item) => item.code === provider.code)) throw new DomainError("validation", "That payment method isn't available.")
      if (provider.code === "cod" && !shipping.cashOnDelivery) throw new DomainError("validation", "Cash on delivery isn't available for this delivery option.")

      const definitions = await deps.catalog.customFieldDefinitions(input.shopper.storeId)
      const customFields = validateCustomFields(definitions, "order", input.customFields)
      const { totals } = priced.cart
      // Cash on delivery is confirmed straight away; prepaid methods wait for the money.
      const status: OrderStatus = provider.code === "cod" ? "confirmed" : "pending_payment"

      const draft: OrderDraft = {
        storeId: input.shopper.storeId,
        customerId: input.shopper.customerId,
        email: input.email.trim().toLowerCase(),
        phone: input.phone.trim(),
        status,
        paymentStatus: "unpaid",
        fulfillmentStatus: "unfulfilled",
        currency: priced.cart.currency,
        lines: toOrderLines(priced, totals.tax),
        subtotal: totals.subtotal,
        discountTotal: totals.discount,
        shippingTotal: totals.shipping ?? 0,
        taxTotal: totals.tax,
        taxIncluded: totals.taxIncluded,
        total: totals.total,
        promotionCodes: priced.promotionResults.map((result) => result.promotion.code ?? result.promotion.title),
        shippingAddress: input.address,
        shippingMethod: { code: shipping.code, label: shipping.label, amount: shipping.effectiveAmount, minDays: shipping.minDays, maxDays: shipping.maxDays },
        paymentMethod: provider.code,
        idempotencyKey: input.idempotencyKey,
        accessTokenHash: hash(accessToken),
        customFields,
        note: input.note?.trim() || null,
        trackingNumber: null,
      }

      const { order, replayed } = await orders.placeOrder({
        draft,
        cartId: cart.id,
        promotionIds: priced.promotionResults.map((result) => result.promotion.id),
        event: {
          topic: "order.placed",
          payload: { email: draft.email, total: draft.total, currency: draft.currency, paymentMethod: draft.paymentMethod, accessToken },
        },
      })
      const next = await startPayment(order, accessToken, provider, input)
      return { order: (await orders.findById(order.id)) ?? order, accessToken, next, replayed }
    },

    nextStepFor,

    async findForViewer(storeId: string, number: string, viewer: OrderViewer): Promise<Order | null> {
      const order = await orders.findByNumber(storeId, number.trim().toUpperCase())
      return order && canView(order, viewer) ? order : null
    },

    /** Guest lookup: order number + the email used at checkout. Both must match. */
    async lookup(storeId: string, number: string, email: string): Promise<Order | null> {
      const order = await orders.findByNumber(storeId, number.trim().toUpperCase())
      return order && order.email === email.trim().toLowerCase() ? order : null
    },

    /** Staff/API access by number, without a viewer check (callers are authenticated separately). */
    lookupByNumber: (storeId: string, number: string) => orders.findByNumber(storeId, number.trim().toUpperCase()),

    listForCustomer: (storeId: string, customerId: string) => orders.listByCustomer(storeId, customerId),

    async cancelByCustomer(order: Order, viewer: OrderViewer): Promise<Order> {
      if (!canView(order, viewer)) throw new DomainError("forbidden", "You can't change this order.")
      if (!customerCanCancel(order.status)) throw new DomainError("invalid_transition", "This order is already being packed, so it can't be cancelled online. Message us and we'll help.")
      return orders.transition(order.id, "cancelled", "customer", "Cancelled by the customer")
    },

    async requestReturn(order: Order, viewer: OrderViewer, lines: { orderLineId: string; quantity: number }[], reason: string) {
      if (!canView(order, viewer)) throw new DomainError("forbidden", "You can't change this order.")
      const deliveredAt = order.history.findLast((entry) => entry.to === "delivered")?.at ?? null
      if (!customerCanRequestReturn(order.status, deliveredAt)) throw new DomainError("invalid_transition", "Returns can be requested within 7 days of delivery.")
      return orders.createReturn({ orderId: order.id, lines, reason: reason.trim() })
    },

    listReturns: (orderId: string) => orders.listReturns(orderId),

    /** Applies a verified provider webhook. Replays are harmless (idempotent on the provider ref). */
    async applyWebhook(providerCode: string, rawBody: string, headers: Headers) {
      const provider = deps.payments.get(providerCode)
      if (!provider?.parseWebhook) throw new DomainError("not_found", "Unknown payment provider.")
      const result = await provider.parseWebhook(rawBody, headers)
      if (!result) return null
      const order = await orders.findById(result.orderId)
      if (!order) throw new DomainError("not_found", "Order not found.")
      if (result.status === "captured" && result.amount !== order.total) throw new DomainError("validation", "Paid amount does not match the order total.")
      return orders.recordPayment({
        orderId: order.id,
        provider: provider.code,
        status: result.status,
        amount: result.status === "captured" ? result.amount : 0,
        currency: order.currency,
        providerRef: result.providerRef,
        idempotencyKey: `webhook:${result.providerRef}:${result.status}`,
      })
    },

    /** Staff operations (Phase 2 admin UI and /api/v1 call these). */
    transition: (orderId: string, to: OrderStatus, actor: string, note?: string, trackingNumber?: string) => orders.transition(orderId, to, actor, note, trackingNumber),
    recordPayment: orders.recordPayment,
    listPayments: orders.listPayments,
    restockReturn: orders.restockReturn,
    search: orders.search,
    listRefunds: orders.listRefunds,
    decideReturn: orders.decideReturn,
    addNote: orders.addNote,
    listNotes: orders.listNotes,
    findById: orders.findById,
    ledger: orders.ledger,
    providers: async () => {
      const available = new Set((await deps.payments.available()).map((provider) => provider.code))
      return ["cod", "bank_transfer", "stripe"].map((code) => ({ code, label: deps.payments.get(code)?.label ?? code, available: available.has(code) }))
    },

    async refund(input: { orderId: string; amount: number; reason: string; lines: { orderLineId: string; quantity: number }[]; restock: boolean; idempotencyKey: string }) {
      const payments = await orders.listPayments(input.orderId)
      const payment = payments.find((item) => item.status === "captured" || item.status === "partially_refunded") ?? null
      const provider = payment ? deps.payments.get(payment.provider) : undefined
      // Money goes back through the provider first; the ledger is written only once it succeeded.
      if (payment?.providerRef && provider?.refund) await provider.refund(payment.providerRef, input.amount, `refund:${input.idempotencyKey}`)
      return orders.createRefund({ ...input, paymentId: payment?.id ?? null })
    },

    anonymiseCustomer: orders.anonymiseCustomer,
  }
}

export type OrderService = ReturnType<typeof createOrderService>
