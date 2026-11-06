import { expect, test, type Page } from "@playwright/test"

import { waitForHydration } from "./support/panels"

// Sale (D-053): one page, Brand New / Pre-Loved tabs over every marked-down pair, no filters.

async function ready(page: Page, route = "/sale") {
  await page.goto(route, { waitUntil: "load" })
  await waitForHydration(page)
}

const cardsIn = (page: Page, id: "new" | "preloved") => page.locator(`#sale-panel-${id} li article`)

test.describe("sale", () => {
  test("has the banner, exactly two tabs and no filters", async ({ page }) => {
    await ready(page)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/on\s*sale/i)
    const tabs = page.getByRole("tablist", { name: "Sale" }).getByRole("tab")
    await expect(tabs).toHaveCount(2)
    await expect(tabs.nth(0)).toHaveText(/^Brand New\s*\d+/)
    await expect(tabs.nth(1)).toHaveText(/^Pre-Loved\s*\d+/)
    await expect(page.getByRole("region", { name: "Filters" })).toHaveCount(0)
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true")
    expect(await cardsIn(page, "new").count()).toBeGreaterThan(0)
  })

  test("every pair shown is marked down, and the tabs swap without a navigation", async ({ page }) => {
    await ready(page)
    await page.evaluate(() => Object.assign(window, { __sameDocument: true }))
    for (const id of ["new", "preloved"] as const) {
      if (id === "preloved") await page.getByRole("tab", { name: /^Pre-Loved/ }).click()
      const cards = cardsIn(page, id)
      expect(await cards.count()).toBeGreaterThan(0)
      for (const card of await cards.all()) await expect(card.locator("s, del")).not.toHaveCount(0)
    }
    await expect(page).toHaveURL(/\/sale\?tab=preloved$/)
    expect(await page.evaluate(() => "__sameDocument" in window)).toBe(true)
  })

  test("the old collection URL redirects to the Sale page and keeps the tab", async ({ page }) => {
    await page.goto("/collections/sale?kind=preloved")
    await expect(page).toHaveURL(/\/sale\?tab=preloved$/)
    await expect(page.getByRole("tab", { name: /^Pre-Loved/ })).toHaveAttribute("aria-selected", "true")
  })
})
