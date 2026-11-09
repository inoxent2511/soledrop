import { expect, type Page } from "@playwright/test"
import { test } from "./support/test"

import { waitForHydration } from "./support/panels"

/**
 * Featured Drop slider (D-061, amends D-048): Brand New then Pre-Loved on a 6 s timer, with the
 * tabs and Pause/Play under the photo (nothing laid on the image).
 */

const slider = (page: Page) =>
  page.locator("section[aria-roledescription=carousel]")
const tab = (page: Page, name: "Brand New" | "Pre-Loved") =>
  slider(page)
    .getByRole("tablist", { name: "Featured drops" })
    .getByRole("tab", { name: new RegExp(name) })

/** The config emulates reduced motion for every test; the timer only runs without it. */
async function ready(
  page: Page,
  motion: "reduce" | "no-preference" = "no-preference"
) {
  await page.emulateMedia({ reducedMotion: motion })
  await page.goto("/")
  await waitForHydration(page)
}

/** Moves the pointer away so the hover hold doesn't pause the timer. */
async function pointerAway(page: Page) {
  await page.mouse.move(0, 0)
}

test.describe("featured drop slider", () => {
  test("keeps the controls under the photo, not on it", async ({ page }) => {
    await ready(page)
    const slides = slider(page).locator("[aria-roledescription=slide]")
    await expect(slides).toHaveCount(2)
    await expect(tab(page, "Brand New")).toHaveAttribute(
      "aria-selected",
      "true"
    )
    await expect(slides.nth(1)).toHaveJSProperty("inert", true)
    const photo = (await slides.nth(0).locator("img").first().boundingBox())!
    // No Pause button (D-062): the tabs are the only controls.
    await expect(
      slider(page).getByRole("button", { name: /pause|play/i })
    ).toHaveCount(0)
    for (const control of [tab(page, "Brand New"), tab(page, "Pre-Loved")]) {
      const box = (await control.boundingBox())!
      expect(box.y).toBeGreaterThanOrEqual(photo.y + photo.height)
    }
    // And nothing from the slider sits over the buy box.
    const buyBox = (await slides
      .nth(0)
      .getByRole("button", { name: /add to cart/i })
      .boundingBox())!
    const controls = (await slider(page)
      .getByRole("tablist", { name: "Featured drops" })
      .boundingBox())!
    expect(
      controls.y + controls.height <= buyBox.y ||
        controls.x + controls.width <= buyBox.x ||
        controls.y >= buyBox.y + buyBox.height
    ).toBe(true)
  })

  test("moves to the next drop on its own and comes round again", async ({
    page,
  }) => {
    await ready(page)
    await pointerAway(page)
    await expect(tab(page, "Pre-Loved")).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 9000 }
    )
    await expect(
      slider(page).locator("[aria-roledescription=slide]").nth(0)
    ).toHaveJSProperty("inert", true)
    await expect(tab(page, "Brand New")).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 9000 }
    )
  })

  test("choosing a drop or using its buy box stops the timer", async ({
    page,
  }) => {
    await ready(page)
    await tab(page, "Pre-Loved").click()
    await pointerAway(page)
    const preloved = slider(page).locator("[aria-roledescription=slide]").nth(1)
    await expect(preloved).toContainText("Pre-Loved")
    // One-off pair (D-062): the tag size and the grade as facts, like the product page; nothing to pick, no quantity.
    await expect(preloved.getByText("Size", { exact: true })).toBeVisible()
    await expect(
      preloved.getByText(/^Tag size: EUR 42 - UK 6 - US 8$/)
    ).toBeVisible()
    await expect(preloved.getByText("Condition", { exact: true })).toBeVisible()
    const grade = preloved.getByRole("button", { name: /^Premium/ })
    await expect(grade).toHaveAttribute("aria-haspopup", "dialog")
    await expect(preloved.getByRole("radio")).toHaveCount(0)
    await expect(preloved.getByText(/quantity/i)).toHaveCount(0)
    await expect(preloved.getByText("Cond:")).toHaveCount(0)
    await grade.click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.keyboard.press("Escape")
    // Adding the pair needs no size choice: it is preselected.
    await preloved.getByRole("button", { name: /add to cart/i }).click()
    await expect(preloved.getByRole("status")).toContainText("Added", {
      timeout: 10000,
    })
    await pointerAway(page)
    await page.waitForTimeout(7000)
    await expect(tab(page, "Pre-Loved")).toHaveAttribute(
      "aria-selected",
      "true"
    )

    await ready(page)
    await slider(page)
      .locator("[aria-roledescription=slide]")
      .nth(0)
      .getByRole("button", { name: "Increase quantity" })
      .click()
    await pointerAway(page)
    await page.waitForTimeout(7000)
    await expect(tab(page, "Brand New")).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })

  test("the tabs follow the keyboard", async ({ page }) => {
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

  test("never autoplays with reduced motion", async ({ page }) => {
    await ready(page, "reduce")
    await pointerAway(page)
    await page.waitForTimeout(7000)
    await expect(tab(page, "Brand New")).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })

  test("the hidden slide never widens the page", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await ready(page)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBe(390)
  })
})

test.describe("featured drop slider without JavaScript", () => {
  test.use({ javaScriptEnabled: false })

  test("both drops render and the tabs are links that jump to them", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(
      slider(page).locator("[aria-roledescription=slide]")
    ).toHaveCount(2)
    await expect(
      slider(page).getByRole("tab", { name: /Pre-Loved/ })
    ).toHaveAttribute("href", "#featured-drop-preloved")
  })
})
