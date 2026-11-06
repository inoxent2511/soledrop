import { beforeEach, describe, expect, it } from "vitest"

import { cartService } from "@/server/cart"
import type { ShopperContext } from "@/server/cart/service"
import { STORE_ID } from "@/server/fixtures/seed"
import { db, resetFixtures } from "@/server/fixtures/store"
import { orderService } from "@/server/orders"
import type { Address } from "@/server/orders/types"

/** The checkout journey through the real services on the fixtures driver (DATA_DRIVER=fixtures). */
const shopper: ShopperContext = { storeId: STORE_ID, customerId: null, customerGroup: null, email: null }
const address: Address = { fullName: "Ayesha Khan", phone: "03001234567", line1: "House 12, Street 4, F-7/2", city: "Islamabad", province: "Islamabad Capital Territory", country: "PK" }

function stockedVariant(minimum = 1) {
  const tables = db()
  const level = tables.inventory.find((row) => row.onHand >= minimum)
  if (!level) throw new Error("seed has no stocked variant")
  return level
}

async function bagWith(variantId: string, quantity = 1) {
  const carts = cartService()
  const { row } = await carts.create(shopper.storeId, null)
  return carts.addLine(row, variantId, quantity, shopper)
}

async function checkout(cart: Awaited<ReturnType<typeof bagWith>> | null, key: string, email = "ayesha@example.com", paymentMethod = "cod") {
  return orderService().checkout({
    cart,
    shopper: { ...shopper, email },
    email,
    phone: "03001234567",
    address,
    shippingCode: "standard",
    paymentMethod,
    idempotencyKey: key,
    orderUrl: (number) => `http://localhost:3100/orders/${number}`,
  })
}

beforeEach(() => {
  resetFixtures()
})

describe("checkout on the fixtures driver", () => {
  it.each(["remove", "reduce"])("releases checkout holds when a shopper changes the bag: %s", async (action) => {
    const level = stockedVariant(2)
    const carts = cartService()
    const row = await bagWith(level.variantId, 2)
    await carts.reserveForCheckout(row, 15)
    expect(db().inventory.find((entry) => entry.variantId === level.variantId)?.reserved).toBe(2)
    if (action === "remove") await carts.removeLine(row, row.lines[0].id)
    else await carts.updateLine(row, row.lines[0].id, 1, shopper)
    expect(db().inventory.find((entry) => entry.variantId === level.variantId)?.reserved).toBe(0)
    expect(db().reservations.filter((entry) => entry.cartId === row.id)).toEqual([])
  })

  it("prices on the server, takes stock and converts the bag", async () => {
    const level = stockedVariant()
    const before = level.onHand
    const cart = await bagWith(level.variantId)
    const { order, replayed, accessToken } = await checkout(cart, "key-1")
    expect(replayed).toBe(false)
    expect(order.number).toBe("SD10001")
    expect(order.status).toBe("confirmed")
    expect(order.total).toBe(order.subtotal - order.discountTotal + order.shippingTotal + (order.taxIncluded ? 0 : order.taxTotal))
    expect(order.total % 100).toBe(0)
    expect(order.lines.reduce((sum, line) => sum + line.tax, 0)).toBe(order.taxTotal)
    expect(db().inventory.find((row) => row.variantId === level.variantId)?.onHand).toBe(before - 1)
    expect(db().carts.find((row) => row.id === cart.id)?.status).toBe("converted")
    expect(orderService().canView(order, { customerId: null, token: accessToken })).toBe(true)
    expect(orderService().canView(order, { customerId: null, token: "guess" })).toBe(false)
  })

  it("replays a repeated submit with the same order and link", async () => {
    const cart = await bagWith(stockedVariant().variantId)
    const first = await checkout(cart, "key-1")
    const second = await checkout(null, "key-1")
    expect(second.replayed).toBe(true)
    expect(second.order.id).toBe(first.order.id)
    expect(second.accessToken).toBe(first.accessToken)
    expect(db().orders).toHaveLength(1)
  })

  it("never sells more than is on hand", async () => {
    const level = stockedVariant()
    const stock = level.onHand
    const results = await Promise.allSettled(
      Array.from({ length: stock + 2 }, async (_, index) => checkout(await bagWith(level.variantId), `key-${index}`, `buyer${index}@example.com`)),
    )
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(stock)
    expect(db().inventory.find((row) => row.variantId === level.variantId)?.onHand).toBe(0)
  })

  it("rejects a once-per-shopper code on a second order with the same email", async () => {
    const level = stockedVariant(2)
    const carts = cartService()
    let cart = await bagWith(level.variantId)
    cart = await carts.applyCode(cart, "WELCOME10", shopper)
    const first = await checkout(cart, "key-1", "sana@example.com")
    expect(first.order.discountTotal).toBeGreaterThan(0)
    expect(first.order.discountTotal % 100).toBe(0)

    let again = await bagWith(level.variantId)
    again = await carts.applyCode(again, "WELCOME10", shopper)
    const second = await checkout(again, "key-2", "SANA@example.com")
    expect(second.order.discountTotal).toBe(0)
  })

  it("cancels before packing and puts the pair back", async () => {
    const level = stockedVariant()
    const before = level.onHand
    const { order, accessToken } = await checkout(await bagWith(level.variantId), "key-1")
    const cancelled = await orderService().cancelByCustomer(order, { customerId: null, token: accessToken })
    expect(cancelled.status).toBe("cancelled")
    expect(db().inventory.find((row) => row.variantId === level.variantId)?.onHand).toBe(before)
    await expect(orderService().cancelByCustomer(cancelled, { customerId: null, token: accessToken })).rejects.toThrow()
  })

  it("leaves a bank transfer order waiting for payment with instructions", async () => {
    const { order, next } = await checkout(await bagWith(stockedVariant().variantId), "key-1", "ayesha@example.com", "bank_transfer")
    expect(order.status).toBe("pending_payment")
    expect(next.type).toBe("instructions")
  })
})
