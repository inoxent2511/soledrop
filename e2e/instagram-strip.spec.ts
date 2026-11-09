import { expect } from "@playwright/test"
import { test } from "./support/test"

// lib/site reads the app env through the "@/" alias, so the profile URL is matched here instead.
const instagramProfile = /^https:\/\/www\.instagram\.com\/[\w.]+$/

// Follow SOLEDROP: every post links to Instagram and shows the Instagram mark on hover or focus (D-051).
test.describe("instagram strip", () => {
  test("each post opens Instagram in a new tab", async ({ page }) => {
    await page.goto("/")
    const posts = page.locator("section[aria-labelledby='instagram-title'] li a")
    await expect(posts).toHaveCount(4)
    for (const post of await posts.all()) {
      await expect(post).toHaveAttribute("href", instagramProfile)
      await expect(post).toHaveAttribute("target", "_blank")
      await expect(post).toHaveAttribute("rel", /noopener/)
      await expect(post).toHaveAccessibleName(/Instagram post \d by .+ \(opens in a new tab\)/)
    }
  })

  test("hover and keyboard focus reveal the Instagram mark", async ({ page }) => {
    await page.goto("/")
    const post = page.locator("section[aria-labelledby='instagram-title'] li a").first()
    const overlay = post.locator("span").first()
    await expect(overlay).toHaveCSS("opacity", "0")
    await post.hover()
    await expect(overlay).toHaveCSS("opacity", "1")
    await expect(overlay.locator("svg")).toBeVisible()

    await page.mouse.move(0, 0)
    await expect(overlay).toHaveCSS("opacity", "0")
    // WebKit skips links on Tab by default (Safari's setting), so focus follows a key press instead,
    // which every engine treats as keyboard focus (:focus-visible).
    await page.keyboard.press("Shift")
    await post.focus()
    await expect(post).toBeFocused()
    expect(await post.evaluate((node) => node.matches(":focus-visible"))).toBe(true)
    await expect(overlay).toHaveCSS("opacity", "1")
  })
})
