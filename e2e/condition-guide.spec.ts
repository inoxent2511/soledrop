import { expect } from "@playwright/test"
import { test } from "./support/test"

import { waitForHydration } from "./support/panels"

// The owner's revised grades, best first (D-069).
const GRADES = ["Like New", "Premium", "Excellent", "Very Good", "Minor Issue"]

/** Condition Guide (D-046): footer entry, the self-playing grade explorer and its no-JavaScript list. */
test.describe("condition guide", () => {
  test("the footer links to it right below Size Guide", async ({ page }) => {
    await page.goto("/faq")
    const help = page
      .getByRole("contentinfo")
      .getByRole("navigation", { name: "Help" })
      .getByRole("link")
    const labels = await help.allTextContents()
    expect(labels.indexOf("Condition Guide")).toBe(
      labels.indexOf("Size Guide") + 1
    )
    await help.filter({ hasText: "Condition Guide" }).click()
    await expect(page).toHaveURL(/\/condition-guide$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /condition guide/i
    )
  })

  // D-047: the guide lives only on its own page; Pre-Loved runs banner, toolbar, grid like every listing.
  // D-071: a card's condition chip is a plain label; the grade's meaning lives on the product page.
  test("Pre-Loved has no guide section and card condition chips are plain labels", async ({
    page,
  }) => {
    await page.goto("/pre-loved")
    await expect(
      page.getByRole("heading", { name: /sneaker condition guide/i })
    ).toHaveCount(0)
    const preLoved = await page.getByRole("combobox").first().boundingBox()
    await page.goto("/collections/men")
    const collection = await page.getByRole("combobox").first().boundingBox()
    expect(preLoved?.y).toBe(collection?.y)
    await page.goto("/pre-loved")
    await waitForHydration(page)
    const chip = page
      .locator("main article")
      .first()
      .getByText(/^Cond:/)
      .locator("..")
    await expect(chip).toHaveText(
      /^Cond:\s*(Like New|Premium|Excellent|Very Good|Minor Issue)$/
    )
    await expect(
      page.getByRole("button", { name: /what condition grades mean/ })
    ).toHaveCount(0)
    await expect(
      page.locator("main article").getByRole("link", { name: /condition/i })
    ).toHaveCount(0)
    await chip.click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page).toHaveURL(/\/pre-loved$/)

    // The product page still explains the grade.
    await page.goto("/products/hoka-bondi-7-grey")
    await waitForHydration(page)
    await page
      .getByRole("button", { name: /what condition grades mean/ })
      .click()
    await expect(page.getByRole("dialog").getByRole("listitem")).toHaveText(
      GRADES.map((label) => new RegExp(`^${label}`))
    )
  })

  // D-073: one vertical story, best grade first, alternating sides, everything visible at once.
  test("lists the five grades top to bottom with score, parts and a shop link", async ({
    page,
  }) => {
    await page.goto("/condition-guide")
    await expect(
      page.getByRole("heading", { level: 2, name: "Our Shoe Condition Guide" })
    ).toBeVisible()
    const blocks = page.locator("main article")
    await expect(blocks).toHaveCount(5)
    for (const [index, grade] of GRADES.entries()) {
      const block = blocks.nth(index)
      await expect(block.getByRole("heading", { level: 3 })).toHaveText(grade)
      await expect(block).toContainText(`Grade ${index + 1} of 5`)
      await expect(
        block.getByRole("img", {
          name: `Condition score: ${5 - index} out of 5`,
        })
      ).toBeVisible()
      await expect(block.locator("dt")).toHaveText([
        "Upper",
        "Midsole",
        "Outsole",
        "Insole",
      ])
      await expect(
        block.getByRole("link", { name: `Shop ${grade} pairs` })
      ).toHaveAttribute("href", /\/pre-loved\?condition=/)
    }
    await expect(page.getByRole("tab")).toHaveCount(0)
  })

  test("alternates sides on desktop and stacks on phones", async ({ page }) => {
    await page.goto("/condition-guide")
    const imageX = async (index: number) =>
      (await page
        .locator("main article")
        .nth(index)
        .getByRole("img", { name: /^Illustration/ })
        .boundingBox())!.x
    const textX = async (index: number) =>
      (await page
        .locator("main article")
        .nth(index)
        .getByRole("heading", { level: 3 })
        .boundingBox())!.x
    expect(await imageX(0)).toBeLessThan(await textX(0))
    expect(await imageX(1)).toBeGreaterThan(await textX(1))
    await page.setViewportSize({ width: 390, height: 844 })
    const first = page.locator("main article").first()
    const image = (await first
      .getByRole("img", { name: /^Illustration/ })
      .boundingBox())!
    const heading = (await first
      .getByRole("heading", { level: 3 })
      .boundingBox())!
    expect(image.y).toBeLessThan(heading.y)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBe(390)
  })

  test("the jump row reaches each grade and a shop link filters the Pre-Loved shop", async ({
    page,
  }) => {
    await page.goto("/condition-guide")
    await page
      .getByRole("navigation", { name: "Jump to a grade" })
      .getByRole("link", { name: /Minor Issue/ })
      .click()
    await expect(page).toHaveURL(/#grade-minor-issue$/)
    await expect(
      page.getByRole("heading", { level: 3, name: "Minor Issue" })
    ).toBeInViewport()
    await page.getByRole("link", { name: "Shop Premium pairs" }).click()
    await expect(page).toHaveURL(/\/pre-loved\?condition=premium$/)
    const chips = page
      .locator("main article")
      .getByText(/^Cond:/)
      .locator("..")
    expect(await chips.count()).toBeGreaterThan(0)
    for (const chip of await chips.all())
      await expect(chip).toHaveText(/Premium$/)
  })
})

test.describe("condition guide without JavaScript", () => {
  test.use({ javaScriptEnabled: false })

  test("lists every grade with its details", async ({ page }) => {
    await page.goto("/condition-guide")
    for (const grade of GRADES)
      await expect(
        page.getByRole("heading", { level: 3, name: grade, exact: true })
      ).toBeVisible()
    await expect(
      page.getByRole("img", { name: /^Condition score/ })
    ).toHaveCount(5)
  })
})
