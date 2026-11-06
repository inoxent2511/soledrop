import { expect, test, type Page } from "@playwright/test"

import { waitForHydration } from "./support/panels"

// Home · New Arrival (D-075): Brand New / Pre-Loved switch under the heading, View all on the right.

const row = (page: Page) =>
  page.locator("section[aria-labelledby=new-arrival-title]")
const tab = (page: Page, name: "Brand New" | "Pre-Loved") =>
  row(page)
    .getByRole("tablist", { name: "New arrivals" })
    .getByRole("tab", { name })
const viewAll = (page: Page) =>
  row(page).getByRole("link", { name: /^View all/ })

async function ready(page: Page) {
  await page.goto("/")
  await waitForHydration(page)
  await row(page).scrollIntoViewIfNeeded()
}

test.describe("home New Arrival row", () => {
  test("puts the switch under the heading on the left and View all on the right", async ({
    page,
  }) => {
    await ready(page)
    const heading = (await row(page)
      .getByRole("heading", { level: 2, name: "New Arrival" })
      .boundingBox())!
    const switcher = (await row(page).getByRole("tablist").boundingBox())!
    const link = (await viewAll(page).boundingBox())!
    expect(switcher.y).toBeGreaterThan(heading.y + heading.height - 1)
    expect(Math.abs(switcher.x - heading.x)).toBeLessThan(2)
    expect(link.x).toBeGreaterThan(switcher.x + switcher.width)
  })

  test("switches between brand-new and pre-loved pairs, and View all follows", async ({
    page,
  }) => {
    await ready(page)
    await expect(tab(page, "Brand New")).toHaveAttribute(
      "aria-selected",
      "true"
    )
    const brandNew = row(page).getByRole("tabpanel", { name: "Brand New" })
    await expect(brandNew.locator("article")).toHaveCount(4)
    await expect(brandNew.getByText(/^Cond:/)).toHaveCount(0)
    await expect(viewAll(page)).toHaveAttribute("href", "/new-arrivals")

    await page.evaluate(() => Object.assign(window, { __sameDocument: true }))
    await tab(page, "Pre-Loved").click()
    await expect(tab(page, "Pre-Loved")).toHaveAttribute(
      "aria-selected",
      "true"
    )
    const preloved = row(page).getByRole("tabpanel", { name: "Pre-Loved" })
    await expect(preloved.locator("article")).toHaveCount(4)
    await expect(preloved.getByText(/^Cond:/)).toHaveCount(4)
    await expect(brandNew).toBeHidden()
    await expect(viewAll(page)).toHaveAttribute(
      "href",
      "/new-arrivals?tab=preloved"
    )
    expect(await page.evaluate(() => "__sameDocument" in window)).toBe(true)

    await viewAll(page).click()
    await expect(page).toHaveURL(/\/new-arrivals\?tab=preloved$/)
    await expect(page.getByRole("tab", { name: /^Pre-Loved/ })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })

  test("the switch follows the keyboard", async ({ page }) => {
    await ready(page)
    await tab(page, "Brand New").focus()
    await page.keyboard.press("ArrowRight")
    await expect(tab(page, "Pre-Loved")).toBeFocused()
    await expect(tab(page, "Pre-Loved")).toHaveAttribute(
      "aria-selected",
      "true"
    )
    await page.keyboard.press("Home")
    await expect(tab(page, "Brand New")).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })
})

test.describe("home New Arrival row without JavaScript", () => {
  test.use({ javaScriptEnabled: false })

  test("the switch's tabs lead to the matching New Arrivals tab", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(
      row(page).getByRole("tab", { name: "Pre-Loved" })
    ).toHaveAttribute("href", "/new-arrivals?tab=preloved")
  })
})
