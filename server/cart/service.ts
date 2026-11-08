import "server-only"

import { createHash, randomBytes } from "node:crypto"

import { MAX_LINE_QUANTITY } from "@/server/cart/fixtures.repository"
import type { CartOperations } from "@/server/cart/repository"
import type { AppliedPromotion, Cart, CartLine, CartRow } from "@/server/cart/types"
import type { CatalogService } from "@/server/catalog/service"
import type { ProductView } from "@/server/catalog/types"
import type { InventoryOperations } from "@/server/inventory/repository"
import type { PricingService } from "@/server/pricing/service"
import { evaluatePromotions, type PromotionResult } from "@/server/promotions/evaluate"
import type { PromotionOperations } from "@/server/promotions/repository"
import { quoteRates, taxFor, taxRateFor, zoneFor } from "@/server/shipping/calculate"
import type { ShippingOperations } from "@/server/shipping/repository"
import type { ShippingQuote } from "@/server/shipping/types"
import { DomainError } from "@/server/shared/errors"
import { newId, now } from "@/server/shared/ids"

export type ShopperContext = {
  storeId: string
  customerId: string | null
  customerGroup: string | null
  email: string | null
}

export type Destination = { country: string; city?: string; province?: string; shippingCode?: string }

/** Everything checkout needs to turn a cart into an order, computed only on the server. */
export type PricedCart = {
  cart: Cart
  row: CartRow
  products: Map<string, ProductView>
  promotionResults: PromotionResult[]
  shippingQuotes: ShippingQuote[]
  selectedShipping: ShippingQuote | null
}

type Deps = {
  carts: CartOperations
  catalog: CatalogService
  pricing: PricingService
  inventory: InventoryOperations
  promotions: PromotionOperations
  shipping: ShippingOperations
  enabledShippingCodes: () => Promise<Set<string>>
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function newCartToken(): string {
  return randomBytes(32).toString("base64url")
}

/** Pre-loved pairs are one-offs, so a line can never hold more than one. */
function lineCap(product: ProductView, available: number) {
  return Math.max(0, Math.min(product.kind === "preloved" ? 1 : MAX_LINE_QUANTITY, available))
}

export function createCartService(deps: Deps) {
  const { carts } = deps

  async function price(row: CartRow, shopper: ShopperContext, destination?: Destination): Promise<PricedCart> {
    const variantIds = row.lines.map((line) => line.variantId)
    const productList = await deps.catalog.getProductsByVariantIds(variantIds)
    const context = { storeId: shopper.storeId, customerGroup: shopper.customerGroup }
    const [views, availability] = await Promise.all([deps.catalog.enrich(productList, context), deps.inventory.availability(variantIds, row.id)])
    const byVariant = new Map<string, ProductView>()
    for (const view of views) for (const variant of view.variants) byVariant.set(variant.id, view)

    const warnings: string[] = []
    const lines: CartLine[] = []
    for (const line of row.lines) {
      const product = byVariant.get(line.variantId)
      const variant = product?.variants.find((item) => item.id === line.variantId)
      const variantPrice = product?.prices.find((item) => item.variantId === line.variantId)
      if (!product || !variant || !variantPrice || product.status !== "active") {
        warnings.push("An item in your bag is no longer available and was removed.")
        continue
      }
      const available = Math.max(0, availability.get(line.variantId) ?? 0)
      const cap = lineCap(product, available)
      const quantity = Math.min(line.quantity, cap)
      if (cap === 0) warnings.push(`${product.title} (EU ${variant.size.eu}) is sold out.`)
      else if (quantity < line.quantity) warnings.push(`Only ${cap} of ${product.title} (EU ${variant.size.eu}) available — quantity updated.`)
      lines.push({
        id: line.id,
        variantId: line.variantId,
        productId: product.id,
        slug: product.slug,
        title: product.title,
        brand: product.brand.name,
        kind: product.kind,
        condition: product.condition,
        size: { eu: variant.size.eu, uk: variant.size.uk, us: variant.size.us },
        colour: typeof product.attributes.colour === "string" ? product.attributes.colour : null,
        image: { url: product.images[0]?.url ?? "", alt: product.images[0]?.alt ?? product.title },
        quantity: cap === 0 ? line.quantity : quantity,
        maxQuantity: cap,
        unitPrice: variantPrice.amount,
        compareAt: variantPrice.compareAt,
        lineTotal: variantPrice.amount * (cap === 0 ? 0 : quantity),
        discount: 0,
        available: cap > 0,
      })
    }

    const purchasable = lines.filter((line) => line.available)
    const subtotal = purchasable.reduce((total, line) => total + line.lineTotal, 0)
    const shopperKey = { customerId: shopper.customerId, email: shopper.email }
    const [available, redemptions, previousOrders, zones, taxRates, enabledCodes] = await Promise.all([
      deps.promotions.listActive(shopper.storeId),
      deps.promotions.redemptionsFor(shopper.storeId, shopperKey),
      deps.promotions.orderCountFor(shopper.storeId, shopperKey),
      deps.shipping.listZones(shopper.storeId),
      deps.shipping.listTaxRates(shopper.storeId),
      deps.enabledShippingCodes(),
    ])
    const { applied, rejected } = evaluatePromotions(available, row.promotionCodes, {
      lines: purchasable.map((line) => ({ lineId: line.id, kind: line.kind, collections: byVariant.get(line.variantId)?.collections ?? [], quantity: line.quantity, lineTotal: line.lineTotal })),
      subtotal,
      customerGroup: shopper.customerGroup,
      previousOrders,
      redemptionsByPromotion: redemptions,
      at: new Date(),
    })
    for (const result of applied) for (const [lineId, amount] of result.perLine) {
      const line = lines.find((item) => item.id === lineId)
      if (line) line.discount += amount
    }
    const discount = applied.reduce((total, result) => total + result.amount, 0)
    const freeShipping = applied.some((result) => result.freeShipping)

    const country = destination?.country ?? "PK"
    const zone = zoneFor(zones, country, destination?.city)
    const quotes = zone && purchasable.length ? quoteRates(zone, subtotal - discount, freeShipping, enabledCodes) : []
    const selected = quotes.find((quote) => quote.code === destination?.shippingCode) ?? quotes[0] ?? null
    const shippingAmount = purchasable.length === 0 ? 0 : (selected?.effectiveAmount ?? null)
    const taxRate = taxRateFor(taxRates, country, destination?.province)
    const { tax, inclusive } = taxFor(subtotal - discount + (shippingAmount ?? 0), taxRate)
    const total = subtotal - discount + (shippingAmount ?? 0) + (inclusive ? 0 : tax)
    const standard = zone?.rates.find((rate) => rate.freeOver !== null)

    const promotions: AppliedPromotion[] = applied.map((result) => ({
      code: result.promotion.code,
      title: result.promotion.title,
      amount: result.amount,
      freeShipping: result.freeShipping,
    }))

    return {
      row,
      products: byVariant,
      promotionResults: applied,
      shippingQuotes: quotes,
      selectedShipping: selected,
      cart: {
        id: row.id,
        currency: row.currency,
        lines,
        itemCount: purchasable.reduce((total, line) => total + line.quantity, 0),
        promotions,
        rejectedCodes: rejected,
        totals: { subtotal, discount, shipping: shippingAmount, tax, taxIncluded: inclusive, total },
        freeShippingThreshold: standard?.freeOver ?? null,
        warnings: [...new Set(warnings)],
      },
    }
  }

  async function mutate(row: CartRow, change: (draft: CartRow) => void): Promise<CartRow> {
    const draft = structuredClone(row)
    change(draft)
    const saved = await carts.save(draft)
    const previous = new Map(row.lines.map((line) => [line.variantId, line.quantity]))
    if (saved.lines.length !== row.lines.length || saved.lines.some((line) => previous.get(line.variantId) !== line.quantity)) {
      await deps.inventory.release(row.id)
    }
    return saved
  }

  return {
    price,

    /** Finds the shopper's cart from its cookie token, or (signed in) their saved cart. */
    async find(storeId: string, token: string | undefined, customerId: string | null): Promise<CartRow | null> {
      const byToken = token ? await carts.findByTokenHash(storeId, hashToken(token)) : null
      if (byToken) return byToken
      return customerId ? carts.findActiveByCustomer(storeId, customerId) : null
    },

    async create(storeId: string, customerId: string | null): Promise<{ row: CartRow; token: string }> {
      const token = newCartToken()
      const timestamp = now()
      const row: CartRow = {
        id: newId(),
        storeId,
        tokenHash: hashToken(token),
        customerId,
        currency: "PKR",
        lines: [],
        promotionCodes: [],
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      return { row: await carts.create(row), token }
    },

    async addLine(row: CartRow, variantId: string, quantity: number, shopper: ShopperContext): Promise<CartRow> {
      const [product] = await deps.catalog.enrich(await deps.catalog.getProductsByVariantIds([variantId]), shopper)
      if (!product || product.status !== "active") throw new DomainError("not_found", "That product is no longer available.")
      const available = (await deps.inventory.availability([variantId], row.id)).get(variantId) ?? 0
      const cap = lineCap(product, available)
      const existing = row.lines.find((line) => line.variantId === variantId)
      const wanted = (existing?.quantity ?? 0) + quantity
      if (cap === 0) throw new DomainError("out_of_stock", "Sorry, that size just sold out.")
      if (wanted > cap) {
        throw new DomainError(
          "out_of_stock",
          product.kind === "preloved" ? "This pre-loved pair is already in your bag." : `Only ${cap} available in this size.`,
          { max: cap },
        )
      }
      return mutate(row, (draft) => {
        const line = draft.lines.find((item) => item.variantId === variantId)
        if (line) line.quantity = wanted
        else draft.lines.push({ id: newId(), variantId, quantity, addedAt: now() })
      })
    },

    async updateLine(row: CartRow, lineId: string, quantity: number, shopper: ShopperContext): Promise<CartRow> {
      const line = row.lines.find((item) => item.id === lineId)
      if (!line) throw new DomainError("not_found", "That item is no longer in your bag.")
      if (quantity === 0) return mutate(row, (draft) => void (draft.lines = draft.lines.filter((item) => item.id !== lineId)))
      const [product] = await deps.catalog.enrich(await deps.catalog.getProductsByVariantIds([line.variantId]), shopper)
      const available = (await deps.inventory.availability([line.variantId], row.id)).get(line.variantId) ?? 0
      const cap = product ? lineCap(product, available) : 0
      if (quantity > cap) throw new DomainError("out_of_stock", cap === 0 ? "Sorry, that size just sold out." : `Only ${cap} available in this size.`, { max: cap })
      return mutate(row, (draft) => {
        const target = draft.lines.find((item) => item.id === lineId)
        if (target) target.quantity = quantity
      })
    },

    async removeLine(row: CartRow, lineId: string): Promise<CartRow> {
      return mutate(row, (draft) => void (draft.lines = draft.lines.filter((item) => item.id !== lineId)))
    },

    /** Adds a code only if it applies now; otherwise throws with the shopper-facing reason. */
    async applyCode(row: CartRow, code: string, shopper: ShopperContext): Promise<CartRow> {
      const normalised = code.trim().toUpperCase()
      const draft = { ...row, promotionCodes: [...new Set([...row.promotionCodes, normalised])] }
      const priced = await price(draft, shopper)
      const rejection = priced.cart.rejectedCodes.find((item) => item.code.toUpperCase() === normalised)
      if (rejection) throw new DomainError("promotion_invalid", rejection.reason)
      return mutate(row, (target) => void (target.promotionCodes = draft.promotionCodes))
    },

    async removeCode(row: CartRow, code: string): Promise<CartRow> {
      return mutate(row, (draft) => void (draft.promotionCodes = draft.promotionCodes.filter((item) => item !== code.toUpperCase())))
    },

    /** On sign-in: fold the guest cart into the customer's cart, or adopt it if they have none. */
    async attachToCustomer(guest: CartRow | null, customerId: string, storeId: string): Promise<CartRow | null> {
      const existing = await carts.findActiveByCustomer(storeId, customerId)
      if (guest && existing && guest.id !== existing.id) return carts.merge(guest.id, existing.id)
      if (guest && !existing) return mutate(guest, (draft) => void (draft.customerId = customerId))
      return existing
    },

    /**
     * Holds the bag's stock while the shopper is on checkout (reserve_stock), so a pair can't
     * sell twice between "Checkout" and "Place order". Holds expire after the TTL.
     */
    async reserveForCheckout(row: CartRow, ttlMinutes: number) {
      await deps.inventory.reserve(row.id, row.lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })), ttlMinutes)
    },

    releaseReservations: (cartId: string) => deps.inventory.release(cartId),

    purgeAbandoned: (days: number) => carts.purgeAbandoned(days),
  }
}

export type CartService = ReturnType<typeof createCartService>
