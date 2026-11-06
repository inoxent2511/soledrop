import "server-only"

import { cookies } from "next/headers"

import { cartService, type Destination } from "@/server/cart"
import type { Cart, CartRow } from "@/server/cart/types"
import { CART_COOKIE, currentCustomer, setCartCookie, shopperContext } from "@/server/http/route"

/** An empty bag, returned before the shopper has added anything (no cart row is created). */
export const EMPTY_CART: Cart = {
  id: "",
  currency: "PKR",
  lines: [],
  itemCount: 0,
  promotions: [],
  rejectedCodes: [],
  totals: { subtotal: 0, discount: 0, shipping: 0, tax: 0, taxIncluded: true, total: 0 },
  // No cart yet, so no threshold to show; the real one comes from the shipping rates (server/cart/service.ts).
  freeShippingThreshold: null,
  warnings: [],
}

/** Resolves the shopper's cart from the cart cookie or their account; optionally creates one. */
export async function loadCart(options: { create: boolean }): Promise<{ row: CartRow | null; shopper: Awaited<ReturnType<typeof shopperContext>> }> {
  const customer = await currentCustomer()
  const shopper = await shopperContext(customer)
  const service = cartService()
  const token = (await cookies()).get(CART_COOKIE)?.value
  let row = await service.find(shopper.storeId, token, shopper.customerId)
  if (!row && options.create) {
    const created = await service.create(shopper.storeId, shopper.customerId)
    await setCartCookie(created.token)
    row = created.row
  }
  return { row, shopper }
}

async function pricedCart(row: CartRow | null, shopper: Awaited<ReturnType<typeof shopperContext>>, destination?: Destination) {
  if (!row) return { cart: EMPTY_CART, shippingQuotes: [] }
  const priced = await cartService().price(row, shopper, destination)
  return { cart: priced.cart, shippingQuotes: priced.shippingQuotes }
}

export async function pricedCartResponse(row: CartRow | null, shopper: Awaited<ReturnType<typeof shopperContext>>, destination?: Destination, init?: ResponseInit) {
  return Response.json(await pricedCart(row, shopper, destination), init)
}

/** The shopper's priced bag for a server-rendered page (same shape as GET /api/cart); never creates a cart. */
export async function cartSnapshot() {
  const { row, shopper } = await loadCart({ create: false })
  return pricedCart(row, shopper)
}
