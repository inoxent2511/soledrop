import transitionContract from "@/tests/fixtures/order-transition-contract.json"

import { describe, expect, it } from "vitest"

import { safeNext } from "@/features/account/lib/safe-next"
import { canTransition, customerCanCancel, customerCanRequestReturn, ORDER_TRANSITIONS, restocksOnTransition } from "@/server/orders/state-machine"
import { ORDER_STATUSES } from "@/server/orders/types"
import { matchesAllRules } from "@/server/rules/engine"
import type { Product } from "@/server/catalog/types"

describe("order state machine", () => {
  it("retains every canonical transition from the pre-migration contract", () => {
    const expected = Object.entries(ORDER_TRANSITIONS).flatMap(([from, targets]) => targets.map((to) => `${from}>${to}`)).sort()
    expect(transitionContract.pairs).toEqual(expected)
  })

  it("has no exits from final states and never goes backwards to pending", () => {
    expect(ORDER_TRANSITIONS.cancelled).toEqual([])
    expect(ORDER_TRANSITIONS.returned).toEqual([])
    for (const from of ORDER_STATUSES) expect(canTransition(from, "pending_payment")).toBe(false)
  })

  it("restocks only cancellations that never left the warehouse", () => {
    expect(restocksOnTransition("confirmed", "cancelled")).toBe(true)
    expect(restocksOnTransition("processing", "cancelled")).toBe(true)
    expect(restocksOnTransition("shipped", "returned")).toBe(false)
  })

  it("lets customers cancel before packing and return within seven days of delivery", () => {
    expect(customerCanCancel("confirmed")).toBe(true)
    expect(customerCanCancel("processing")).toBe(false)
    const delivered = "2026-11-01T10:00:00Z"
    expect(customerCanRequestReturn("delivered", delivered, Date.parse("2026-11-08T09:59:59Z"))).toBe(true)
    expect(customerCanRequestReturn("delivered", delivered, Date.parse("2026-11-08T10:00:01Z"))).toBe(false)
    expect(customerCanRequestReturn("shipped", null)).toBe(false)
  })
})

describe("collection rules", () => {
  const product = { kind: "preloved", gender: "men", tags: ["running"], publishedAt: "2026-11-01T00:00:00Z" } as unknown as Product
  it("needs every rule and never matches an empty rule list", () => {
    const at = Date.parse("2026-11-04T00:00:00Z")
    expect(matchesAllRules(product, [{ field: "kind", equals: "preloved" }, { field: "publishedWithinDays", days: 7 }], at)).toBe(true)
    expect(matchesAllRules(product, [{ field: "kind", equals: "preloved" }, { field: "tag", equals: "basketball" }], at)).toBe(false)
    expect(matchesAllRules(product, [], at)).toBe(false)
  })
})

describe("safeNext", () => {
  it("only follows same-site paths", () => {
    expect(safeNext("/checkout")).toBe("/checkout")
    expect(safeNext("//evil.example")).toBe("/account")
    expect(safeNext("https://evil.example")).toBe("/account")
    expect(safeNext("/\\evil.example")).toBe("/account")
    expect(safeNext(undefined)).toBe("/account")
  })
})
