import { expect, test, type Page } from "@playwright/test"

import { waitForHydration } from "./support/panels"

// Listing sort (D-063, D-064): the site's dropdown, white list with the lime highlight, eight orders.

const sortBox = (page: Page) => page.getByRole("combobox", { name: "Sort by" })

async function ready(page: Page, route: string) {
  await page.goto(route, { waitUntil: "load" })
  await waitForHydration(page)
}

/** Card titles in the grid, in order. */
const titles = (page: Page) =>
  page.locator("main ul li article h2, main ul li article h3").allInnerTexts()

test.describe("sort without JavaScript", () => {
  test.use({ javaScriptEnabled: false })

  test("has an accessible name before hydration", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto("/collections/new-arrivals")
    await expect(sortBox(page)).toHaveAccessibleName("Sort by")
    await expect(sortBox(page)).toContainText("Featured")
  })
})

test.describe("listing sort", () => {
  test("offers every order and shows the chosen one", async ({ page }) => {
    await ready(page, "/collections/brand-new")
    await expect(sortBox(page)).toContainText("Featured")
    await sortBox(page).click()
    const options = page.getByRole("option")
    await expect(options).toHaveText([
      "Featured",
      "Title: A-Z",
      "Title: Z-A",
      "Date: New to Old",
      "Date: Old to New",
      "Price: Low to High",
      "Price: High to Low",
      "Discount: High to Low",
    ])
    await expect(
      page.getByRole("option", { name: "Featured" })
    ).toHaveAttribute("aria-selected", "true")
    // The list is white; the option under the pointer turns lime.
    const listbox = page.getByRole("listbox")
    expect(
      await listbox.evaluate((node) => getComputedStyle(node).backgroundColor)
    ).toBe("rgb(255, 255, 255)")
    const newest = page.getByRole("option", { name: "Date: New to Old" })
    await newest.hover()
    await expect(newest).toHaveCSS("background-color", "rgb(199, 241, 38)")
    await newest.click()
    await expect(page).toHaveURL(/\/collections\/brand-new\?sort=newest$/)
    await expect(sortBox(page)).toContainText("Date: New to Old")
  })

  test("Title A-Z and Z-A reorder the grid alphabetically", async ({
    page,
  }) => {
    for (const [label, query, compare] of [
      [
        "Title: A-Z",
        "title-asc",
        (a: string, b: string) =>
          a.localeCompare(b, "en", { sensitivity: "base" }),
      ],
      [
        "Title: Z-A",
        "title-desc",
        (a: string, b: string) =>
          b.localeCompare(a, "en", { sensitivity: "base" }),
      ],
    ] as const) {
      await ready(page, "/collections/brand-new")
      await sortBox(page).click()
      await page.getByRole("option", { name: label }).click()
      await expect(page).toHaveURL(new RegExp(`sort=${query}$`))
      const shown = await titles(page)
      expect(shown.length).toBeGreaterThan(1)
      expect(shown).toEqual([...shown].sort(compare))
    }
  })

  test("works from the keyboard", async ({ page }) => {
    await ready(page, "/pre-loved")
    await sortBox(page).focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("listbox")).toBeVisible()
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/pre-loved\?sort=/)
  })

  test("an unknown sort in the URL falls back to Featured", async ({
    page,
  }) => {
    await ready(page, "/collections/brand-new?sort=bogus")
    await expect(sortBox(page)).toContainText("Featured")
  })
})
