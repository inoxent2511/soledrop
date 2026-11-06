import { describe, expect, it } from "vitest"

import {
  freeDeliveryProgress,
  saleSavings,
} from "@/features/cart/lib/free-delivery"
import type { Cart, CartLine } from "@/server/cart/types"

const totals = (subtotal: number, discount = 0): Cart["totals"] => ({
  subtotal,
  discount,
  shipping: 25000,
  tax: 0,
  taxIncluded: true,
  total: subtotal - discount,
})

const line = (unitPrice: number, compareAt: number | null, quantity = 1) =>
  ({ unitPrice, compareAt, quantity }) as CartLine

describe("freeDeliveryProgress", () => {
  it("is null when the store has no free-delivery threshold", () => {
    expect(
      freeDeliveryProgress({
        freeShippingThreshold: null,
        totals: totals(100000),
      })
    ).toBeNull()
  })

  it("measures the subtotal after discounts, as checkout does", () => {
    // PKR 6,000 of shoes with a PKR 1,500 code is PKR 4,500 against a PKR 5,000 threshold.
    expect(
      freeDeliveryProgress({
        freeShippingThreshold: 500000,
        totals: totals(600000, 150000),
      })
    ).toEqual({ threshold: 500000, remaining: 50000, ratio: 0.9 })
  })

  it("caps at unlocked once the threshold is met", () => {
    expect(
      freeDeliveryProgress({
        freeShippingThreshold: 500000,
        totals: totals(900000),
      })
    ).toEqual({ threshold: 500000, remaining: 0, ratio: 1 })
  })
})

describe("saleSavings", () => {
  it("adds compare-at minus price for every pair on sale, times quantity", () => {
    expect(
      saleSavings({
        lines: [
          line(1999900, 3499900, 2),
          line(1999900, null),
          line(500000, 400000),
        ],
      })
    ).toBe(3000000)
  })
})
