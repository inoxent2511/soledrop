import { describe, expect, it } from "vitest"

import { promoBar } from "@/content/navigation"
import { formatPrice } from "@/lib/format"
import { commerceSeed } from "@/server/fixtures/commerce-seed"

// The promo bar's amount is written by hand; the threshold checkout uses lives in the shipping rates (D-060).
describe("free-delivery copy", () => {
  it("the promo bar states the standard rate's free-delivery threshold", () => {
    const standard = commerceSeed.shippingZones[0]?.rates.find(
      (rate) => rate.code === "standard"
    )
    expect(standard?.freeOver).not.toBeNull()
    expect(promoBar.text).toContain(
      formatPrice(standard!.freeOver!, "PKR", { symbol: true })
    )
  })
})
