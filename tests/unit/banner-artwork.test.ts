import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CollectionBanner } from "@/features/catalog/components/collection-banner"
import { FullHeroCarousel } from "@/features/home/components/full-hero-carousel"
import { homeInput } from "@/features/admin/content/home-schema"
import { emptyHome } from "@/server/content/home-types"

describe("complete banner artwork", () => {
  it("accepts and retains the image mode and dimensions when saving homepage content", () => {
    const slide = { src: "/images/site/hero-2.jpg", alt: "Sole Drop collection artwork", width: 1680, height: 420, mode: "full" as const }
    expect(homeInput.parse({ ...emptyHome, slides: [slide] }).slides[0]).toEqual(slide)
    expect(homeInput.safeParse({ ...emptyHome, slides: [{ ...slide, alt: "" }] }).success).toBe(false)
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

  it("renders the complete homepage image without the old hero copy", () => {
    const html = renderToStaticMarkup(createElement(FullHeroCarousel, {
      slides: [{ src: "/images/site/hero-2.jpg", alt: "Find your pair artwork", width: 1920, height: 720, mode: "full" }],
    }))
    expect(html).toContain("Find your pair artwork")
    expect(html).toContain("width=\"1920\"")
    expect(html).not.toContain("object-cover")
  })
})
