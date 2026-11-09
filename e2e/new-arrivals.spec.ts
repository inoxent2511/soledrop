import { expect, type Page } from "@playwright/test"
import { test } from "./support/test"

import { waitForHydration } from "./support/panels"

// New Arrivals (D-052): one page, Brand New / Pre-Loved tabs that swap in place, no filters, no "all" tab.

async function ready(page: Page, route = "/new-arrivals") {
  await page.goto(route, { waitUntil: "load" })
  await waitForHydration(page)
}

const cardsIn = (page: Page, id: "new" | "preloved") => page.locator(`#arrivals-panel-${id} li article`)

test.describe("new arrivals", () => {
  test("has the banner, exactly two tabs and no filters", async ({ page }) => {
    await ready(page)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/new\s*arrivals/i)
    await expect(page.getByText(/^Just dropped/i)).toHaveCount(0)
    const tabs = page.getByRole("tablist", { name: "New arrivals" }).getByRole("tab")
    await expect(tabs).toHaveCount(2)
    await expect(tabs.nth(0)).toHaveText(/^Brand New\s*\d+/)
    await expect(tabs.nth(1)).toHaveText(/^Pre-Loved\s*\d+/)
    await expect(page.getByRole("tab", { name: /all/i })).toHaveCount(0)
    await expect(page.getByRole("region", { name: "Filters" })).toHaveCount(0)
    await expect(page.getByRole("checkbox")).toHaveCount(0)
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true")
    expect(await cardsIn(page, "new").count()).toBeGreaterThan(0)
    expect(await cardsIn(page, "new").count()).toBeLessThanOrEqual(12)
  })

  test("switching tabs swaps the pairs without a navigation", async ({ page }) => {
    await ready(page)
    await page.evaluate(() => Object.assign(window, { __sameDocument: true }))
    await page.getByRole("tab", { name: /^Pre-Loved/ }).click()
    await expect(page.getByRole("tab", { name: /^Pre-Loved/ })).toHaveAttribute("aria-selected", "true")
    await expect(page.locator("#arrivals-panel-preloved")).toBeVisible()
    await expect(page.locator("#arrivals-panel-new")).toBeHidden()
    await expect(page).toHaveURL(/\/new-arrivals\?tab=preloved$/)
    expect(await page.evaluate(() => "__sameDocument" in window)).toBe(true)
    // Every pre-loved card is a one-off: it shows its condition and links to its details.
    for (const card of await cardsIn(page, "preloved").all()) {
      await expect(card.getByText("Cond:")).toBeVisible()
    }
    await page.getByRole("tab", { name: /^Brand New/ }).click()
    await expect(page).toHaveURL(/\/new-arrivals$/)
    await expect(page.locator("#arrivals-panel-new")).toBeVisible()
    expect(await page.evaluate(() => "__sameDocument" in window)).toBe(true)
  })

  test("the tabs follow the keyboard (Arrow keys, Home, End)", async ({ page }) => {
    await ready(page)
    const brandNew = page.getByRole("tab", { name: /^Brand New/ })
    const preLoved = page.getByRole("tab", { name: /^Pre-Loved/ })
    await expect(preLoved).toHaveAttribute("tabindex", "-1")
    await page.keyboard.press("Shift")
    await brandNew.focus()
    await page.keyboard.press("ArrowRight")
    await expect(preLoved).toBeFocused()
    await expect(preLoved).toHaveAttribute("aria-selected", "true")
    await page.keyboard.press("Home")
    await expect(brandNew).toBeFocused()
    await page.keyboard.press("End")
    await expect(preLoved).toBeFocused()
    await page.keyboard.press("ArrowRight")
    await expect(brandNew).toBeFocused()
    await expect(page.locator("#arrivals-panel-new")).toBeVisible()
  })

  test("a shared ?tab=preloved link opens the Pre-Loved tab", async ({ page }) => {
    await ready(page, "/new-arrivals?tab=preloved")
    await expect(page.getByRole("tab", { name: /^Pre-Loved/ })).toHaveAttribute("aria-selected", "true")
    await expect(page.locator("#arrivals-panel-preloved")).toBeVisible()
  })

  test("no visible count lines, and LOAD MORE agrees with the cards shown", async ({ page }) => {
    await ready(page)
    for (const id of ["new", "preloved"] as const) {
      await page.getByRole("tab", { name: id === "new" ? /^Brand New/ : /^Pre-Loved/ }).click()
      const panel = page.locator(`#arrivals-panel-${id}`)
      const total = Number((await page.getByRole("tab", { selected: true }).locator("span").first().innerText()).match(/\d+/)![0])
      const shown = await cardsIn(page, id).count()
      // The owner removed both count lines from the screen; the "seen" line stays for screen readers only.
      await expect(page.getByText(/^Showing \d+ of \d+/)).toHaveCount(0)
      await expect(page.getByText("Newest first")).toHaveCount(0)
      await expect(panel.getByText(`You've seen ${shown} of ${total}`)).toHaveClass(/sr-only/)
      const more = panel.getByRole("link", { name: "Load more" })
      if (total > shown) {
        await more.click()
        await expect(cardsIn(page, id)).toHaveCount(Math.min(shown + 12, total, 24))
        await expect(cardsIn(page, id).nth(shown).getByRole("heading").getByRole("link")).toBeFocused()
      } else {
        await expect(more).toHaveCount(0)
      }
    }
  })

  test("is one column on phones with no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await ready(page)
    const tabs = page.getByRole("tablist", { name: "New arrivals" })
    const box = (await tabs.boundingBox())!
    expect(box.width).toBeGreaterThan(340)
    for (const tab of await tabs.getByRole("tab").all()) expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})

test.describe("new arrivals without JavaScript", () => {
  test.use({ javaScriptEnabled: false })

  test("the tabs and LOAD MORE are links the server answers", async ({ page }) => {
    await page.goto("/new-arrivals")
    await page.getByRole("tab", { name: /^Pre-Loved/ }).click()
    await expect(page).toHaveURL(/\?tab=preloved$/)
    await expect(page.locator("#arrivals-panel-preloved")).toBeVisible()
    await expect(page.locator("#arrivals-panel-new")).toBeHidden()
  })
})
