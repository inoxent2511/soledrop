import { staffService } from "@/server/db/staff-service"
import { fixtureStaff } from "@/tests/helpers/staff"
import { beforeEach, describe, expect, it } from "vitest"

import { promotionInput, type PromotionInput } from "@/features/admin/promotions/schema"
import { type RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import { STORE_ID } from "@/server/fixtures/seed"
import { db, resetFixtures } from "@/server/fixtures/store"
import { promotionsRepository } from "@/server/promotions"
import { createStaffPromotions, generateCode, promotionState } from "@/server/promotions/staff"
import { shippingRepository } from "@/server/shipping"
import { createStaffShipping } from "@/server/shipping/staff"

/** Staff promotions, shipping and tax (admin A5) on the fixtures driver. */

const meta: RequestMeta = { ip: "203.0.113.9", userAgent: "vitest", requestId: "req" }
let audits: string[] = []

function staffAs(roleKey: string): StaffContext {
  return fixtureStaff(roleKey)
}

const promotions = () => staffService(createStaffPromotions({ promotions: promotionsRepository(), orderNumber: async () => null, audit: async (_s, _m, entry) => void audits.push(entry.action), revalidate: () => undefined }))
const shipping = () => staffService(createStaffShipping({ shipping: shippingRepository(), audit: async (_s, _m, entry) => void audits.push(entry.action), revalidate: () => undefined }))

const draft = (changes: Partial<PromotionInput> = {}): PromotionInput =>
  promotionInput.parse({ title: "Ten off pre-loved", code: "preloved10", conditions: [{ type: "product_kind", kind: "preloved" }], actions: [{ type: "percent_off_items", basisPoints: 1000, kind: "preloved" }], startsAt: null, endsAt: null, usageLimit: null, perCustomerLimit: null, ...changes })

beforeEach(() => {
  resetFixtures()
  audits = []
})

describe("staff promotions", () => {
  it("creates codes upper-case, refuses a taken code, and simulates with the checkout engine", async () => {
    const marketing = staffAs("marketing")
    const saved = await promotions().save(marketing, meta, draft())
    expect(saved.code).toBe("PRELOVED10")
    await expect(promotions().save(marketing, meta, draft({ title: "Clash", code: "PRELOVED10" }))).rejects.toMatchObject({ code: "conflict" })
    await expect(promotions().save(staffAs("support_agent"), meta, draft({ code: "NOPE1" }))).rejects.toMatchObject({ code: "forbidden" })

    const preloved = promotions().simulate(marketing, draft(), { lines: [{ kind: "preloved", collections: [], quantity: 1, unitPrice: 1_000_000 }], customerGroup: null, previousOrders: 0 })
    expect(preloved).toMatchObject({ applies: true, discount: 100_000, total: 900_000 })
    const brandNew = promotions().simulate(marketing, draft(), { lines: [{ kind: "new", collections: [], quantity: 1, unitPrice: 1_000_000 }], customerGroup: null, previousOrders: 0 })
    expect(brandNew.applies).toBe(false)
    expect(brandNew.reason).toBeTruthy()
    const scheduled = promotions().simulate(marketing, draft({ startsAt: new Date(Date.now() + 86_400_000).toISOString() }), { lines: [{ kind: "preloved", collections: [], quantity: 1, unitPrice: 1_000_000 }], customerGroup: null, previousOrders: 0 })
    expect(scheduled).toMatchObject({ applies: false, reason: "This code isn't active yet." })
  })

  it("switches used promotions off instead of deleting them, and keeps limits above use", async () => {
    const marketing = staffAs("marketing")
    const fresh = await promotions().save(marketing, meta, draft({ code: "FRESH1" }))
    await promotions().remove(marketing, meta, fresh.id)
    const used = db().promotions[0]
    used.timesUsed = 3
    await expect(promotions().remove(marketing, meta, used.id)).rejects.toMatchObject({ code: "conflict" })
    await expect(promotions().save(marketing, meta, draft({ code: used.code, title: used.title, usageLimit: 2 }), used.id)).rejects.toMatchObject({ code: "validation" })
    const off = await promotions().setActive(marketing, meta, used.id, false)
    expect(promotionState(off)).toBe("off")
    expect((await promotionsRepository().listActive(STORE_ID)).some((row) => row.id === used.id)).toBe(false)
    expect(audits).toEqual(["promotion.created", "promotion.deleted", "promotion.switched_off"])
  })

  it("generates readable codes", () => {
    const code = generateCode()
    expect(code).toMatch(/^SD-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
    expect(generateCode()).not.toBe(code)
  })
})

describe("staff shipping and tax", () => {
  it("saves zones with their rates, tests quotes like checkout, and keeps at least one zone", async () => {
    const manager = staffAs("store_manager")
    const zone = await shipping().saveZone(manager, meta, { name: "Karachi same day", countries: ["PK"], cities: ["Karachi"], position: 0, rates: [{ code: "same-day", label: "Same day", amount: 40_000, freeOver: 2_000_000, minDays: 0, maxDays: 1, cashOnDelivery: true }] })
    const karachi = await shipping().test(manager, { country: "PK", city: "karachi", subtotal: 1_000_000 })
    expect(karachi.zone?.id).toBe(zone.id)
    expect(karachi.quotes[0]).toMatchObject({ code: "same-day", effectiveAmount: 40_000 })
    expect((await shipping().test(manager, { country: "PK", city: "Karachi", subtotal: 2_500_000 })).quotes[0]).toMatchObject({ free: true, effectiveAmount: 0 })
    expect((await shipping().test(manager, { country: "PK", city: "Lahore", subtotal: 1_000_000 })).zone?.id).not.toBe(zone.id)

    await expect(shipping().saveZone(staffAs("support_agent"), meta, { name: "X", countries: ["PK"], cities: [], position: 0, rates: [] })).rejects.toMatchObject({ code: "forbidden" })
    for (const other of db().shippingZones.filter((row) => row.id !== zone.id)) await shipping().deleteZone(manager, meta, other.id)
    await expect(shipping().deleteZone(manager, meta, zone.id)).rejects.toMatchObject({ code: "conflict" })
  })

  it("replaces the tax table and applies a province rate over the country rate", async () => {
    const manager = staffAs("store_manager")
    await shipping().saveTaxRates(manager, meta, [
      { country: "PK", province: null, label: "Sales tax", basisPoints: 1800, inclusive: true },
      { country: "PK", province: "Punjab", label: "Punjab sales tax", basisPoints: 1600, inclusive: true },
    ])
    const punjab = await shipping().test(manager, { country: "PK", city: "Lahore", province: "Punjab", subtotal: 1_160_000 })
    expect(punjab.tax).toMatchObject({ label: "Punjab sales tax", tax: 160_000, inclusive: true })
    const sindh = await shipping().test(manager, { country: "PK", city: "Karachi", province: "Sindh", subtotal: 1_180_000 })
    expect(sindh.tax).toMatchObject({ label: "Sales tax", tax: 180_000 })
    expect(audits).toContain("tax_rates.updated")
  })
})
