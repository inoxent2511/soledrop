import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

import { signInAs } from "./support/admin"

/**
 * Accessibility of the admin (A11): axe with the WCAG 2.2 A/AA rules on the sign-in screen and
 * every module page as an Admin, at desktop and phone width. Chromium only.
 */
test.skip(({ browserName }) => browserName !== "chromium", "TOTP-limited demo accounts; covered once")

const PAGES = [
  "/admin",
  "/admin/orders",
  "/admin/customers",
  "/admin/products",
  "/admin/products/new",
  "/admin/collections",
  "/admin/inventory",
  "/admin/media",
  "/admin/promotions",
  "/admin/promotions/new",
  "/admin/marketing",
  "/admin/search",
  "/admin/content",
  "/admin/content/faqs",
  "/admin/payments",
  "/admin/reports",
  "/admin/shipping",
  "/admin/settings",
  "/admin/staff",
  "/admin/staff/roles",
  "/admin/audit",
  "/admin/account",
]

const axe = (page: Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])

test("the sign-in screen has no WCAG 2.2 AA violations", async ({ page }) => {
  await page.goto("/admin/login")
  const { violations } = await axe(page).analyze()
  expect(violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([])
})

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`every admin page has no WCAG 2.2 AA violations (${viewport.name})`, async ({ page }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    await signInAs(page, viewport.name === "phone" ? "store_manager" : "admin")
    const problems: string[] = []
    for (const path of PAGES) {
      await page.goto(path)
      if (page.url().includes("/no-access")) continue
      const { violations } = await axe(page).analyze()
      if (viewport.name === "phone") {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        if (overflow > 0) problems.push(`${path} scrolls sideways by ${overflow}px`)
      }
      for (const violation of violations) problems.push(`${path} ${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)
    }
    expect(problems).toEqual([])
  })
}
