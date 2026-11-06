import { expect, test } from "@playwright/test"

// Top Brands is a running strip, for show only (D-050).
test.describe("top brands strip", () => {
  test("names are plain text that keep their colour on hover", async ({ page }) => {
    await page.goto("/")
    const section = page.locator("section[aria-labelledby='brands-title']")
    await expect(section.getByRole("link")).toHaveCount(0)
    // The isolated catalogue has ten managed brands; the strip uses the saved brand registry.
    await expect(section.getByRole("listitem")).toHaveCount(10)
    const nike = section.getByRole("listitem").filter({ hasText: "NIKE" })
    const before = await nike.evaluate((node) => getComputedStyle(node).color)
    await nike.hover()
    expect(await nike.evaluate((node) => getComputedStyle(node).color)).toBe(before)
    expect(page.url()).toMatch(/\/$/)
  })

  test("the strip runs on its own with even gaps", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" })
    await page.goto("/")
    const section = page.locator("section[aria-labelledby='brands-title']")
    const track = section.locator("ul").first().locator("..")
    const offset = () => track.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m41)
    const start = await offset()
    await page.waitForTimeout(500)
    expect(await offset()).toBeLessThan(start)

    const gaps = await track.evaluate((node) => {
      const items = [...node.querySelectorAll("li")].map((item) => {
        const text = document.createRange()
        text.selectNodeContents(item)
        return text.getBoundingClientRect()
      })
      return items.slice(1).map((item, index) => Math.round(item.left - items[index]!.right))
    })
    expect(new Set(gaps).size).toBe(1)

    // No controls: the owner wants the strip to run on its own (D-050).
    await expect(section.getByRole("button")).toHaveCount(0)
  })

  test("with reduced motion the names sit still and are listed once", async ({ page }) => {
    await page.goto("/")
    const section = page.locator("section[aria-labelledby='brands-title']")
    await expect(section.locator("ul").nth(1)).toBeHidden()
    expect(await section.locator("ul").first().locator("..").evaluate((node) => getComputedStyle(node).animationName)).toBe("none")

    // The still row wraps instead of running past the edge: every name is fully in view.
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const strip = (await section.locator("ul").first().locator("../..").boundingBox())!
      for (const item of await section.getByRole("listitem").all()) {
        const box = (await item.boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(strip.x - 0.5)
        expect(box.x + box.width).toBeLessThanOrEqual(strip.x + strip.width + 0.5)
      }
    }
  })

  test("both sides keep the page gutter and the strip never widens the page", async ({ page }) => {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto("/")
      const heading = await page.locator("#brands-title").boundingBox()
      const strip = await page.locator("section[aria-labelledby='brands-title'] ul").first().locator("../..").boundingBox()
      expect(Math.round(strip!.x)).toBe(Math.round(heading!.x))
      expect(Math.round(width - strip!.x - strip!.width)).toBe(Math.round(heading!.x))
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    }
  })
})
