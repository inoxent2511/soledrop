import { expect, type Locator } from "@playwright/test"
import { test } from "./support/test"

import { waitForHydration } from "./support/panels"

/** The hovered control's fill and the fill of the section around it. */
async function fills(control: Locator) {
  await control.hover()
  await control.page().waitForTimeout(250)
  return control.evaluate((element) => {
    let parent = element.parentElement
    while (parent && getComputedStyle(parent).backgroundColor === "rgba(0, 0, 0, 0)") parent = parent.parentElement
    return { own: getComputedStyle(element).backgroundColor, section: parent ? getComputedStyle(parent).backgroundColor : "" }
  })
}

// Regression BUG-017: lime CTAs on black hovered to black, and the black CTA on the lime bar hovered to lime.
test.describe("hover fills never melt into their section", () => {
  test("home CTAs on black and the footer CTA on the lime bar", async ({ page }) => {
    await page.goto("/")
    await waitForHydration(page)
    for (const control of [
      page.locator("section[aria-labelledby='hero-title']").getByRole("link").first(),
      page.getByRole("button", { name: "Add to cart", exact: true }).first(),
      page.getByRole("button", { name: /join now/i }),
      page.getByRole("contentinfo").getByRole("link", { name: "SHOP NOW" }),
    ]) {
      const { own, section } = await fills(control)
      expect(own, (await control.textContent()) ?? "").not.toBe(section)
    }
  })

  // Regression BUG-018: the disabled "−" took the hover fill, dropping its faint glyph below 3:1.
  test("a disabled stepper button has no hover fill", async ({ page }) => {
    await page.goto("/")
    await waitForHydration(page)
    const decrease = page.getByRole("button", { name: "Decrease quantity" }).first()
    await expect(decrease).toBeDisabled()
    const before = await decrease.evaluate((element) => getComputedStyle(element).backgroundColor)
    await decrease.hover({ force: true })
    await page.waitForTimeout(250)
    expect(await decrease.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(before)
  })
})
