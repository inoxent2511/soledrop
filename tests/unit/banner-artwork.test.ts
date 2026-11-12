import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CollectionBanner } from "@/features/catalog/components/collection-banner"
import { homeInput } from "@/features/admin/content/home-schema"
import { emptyHome } from "@/server/content/home-types"

describe("complete banner artwork", () => {
  it("keeps homepage photos separate from the saved heading and buttons", () => {
    const slide = { src: "/images/site/hero-2.jpg", alt: "Sole Drop hero photo", width: 1680, height: 420 }
    expect(homeInput.parse({ ...emptyHome, slides: [slide] }).slides[0]).toEqual(slide)
    expect(homeInput.safeParse({ ...emptyHome, slides: [{ ...slide, mode: "full" }] }).success).toBe(false)
  })

  it("renders collection artwork without a second headline or description", () => {
    const html = renderToStaticMarkup(createElement(CollectionBanner, {
      title: "New Arrivals", headline: ["New", "Arrivals"], description: "Legacy description",
      image: { url: "/images/site/hero-2.jpg", alt: "New Arrivals artwork", width: 1680, height: 420, mode: "full" },
    }))
    expect(html).toContain("New Arrivals artwork")
    expect(html).toContain("width=\"1680\"")
    expect(html).not.toContain("Legacy description")
    expect(html).not.toContain("object-cover")
  })

})
