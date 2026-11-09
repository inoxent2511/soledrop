import { expect, type Page } from "@playwright/test"
import { test } from "./support/test"

// Home · Brand New Drops (D-076) above Pre-Loved Drops (D-074): four pairs each, View all on the right.

const drops = (page: Page, id: string) =>
  page.locator(`section[aria-labelledby=${id}]`)

test.describe("home drops", () => {
  test("Brand New Drops sits right above Pre-Loved Drops with four brand-new pairs", async ({
    page,
  }) => {
    await page.goto("/")
    const headings = await page
      .getByRole("heading", { level: 2 })
      .allInnerTexts()
    const brandNewAt = headings.findIndex((text) =>
      /brand new drops/i.test(text)
    )
    expect(brandNewAt).toBeGreaterThan(-1)
    expect(headings[brandNewAt + 1]).toMatch(/pre-loved drops/i)

    const brandNew = drops(page, "brand-new-title")
    await expect(brandNew.locator("article")).toHaveCount(4)
    // Brand-new cards offer sizes and Add to cart, never a condition.
    await expect(brandNew.getByText(/^Cond:/)).toHaveCount(0)
    await expect(
      brandNew.getByRole("button", { name: /add to cart/i })
    ).toHaveCount(4)
  })

  for (const [id, name, href] of [
    ["brand-new-title", "View all brand-new pairs", "/collections/brand-new"],
    ["preloved-title", "View all pre-loved pairs", "/pre-loved"],
  ] as const) {
    test(`${name} sits right of the heading and opens ${href}`, async ({
      page,
    }) => {
      await page.goto("/")
      const section = drops(page, id)
      const heading = (await section
        .getByRole("heading", { level: 2 })
        .boundingBox())!
      const link = section.getByRole("link", { name })
      const box = (await link.boundingBox())!
      expect(box.x).toBeGreaterThan(heading.x + heading.width)
      await link.click()
      await expect(page).toHaveURL(
        new RegExp(`${href.replace(/[/?]/g, "\\$&")}$`)
      )
    })
  }
})
