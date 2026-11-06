import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

import { openPanel, PANELS, panelApplies, waitForHydration } from "./support/panels"

/**
 * Accessibility sweep (E1): axe-core WCAG 2.0/2.1/2.2 A + AA rules on every storefront route at a
 * phone and a desktop width in both themes, on every open header panel, and on checkout with a
 * pair in the bag. Each failure lists rule, impact and the first offending element.
 */
const ROUTES = [
  "/", "/new-arrivals", "/sale", "/terms", "/privacy", "/returns", "/collections/new-arrivals", "/pre-loved", "/products/asics-gel-kayano-30-black-silver", "/products/hoka-bondi-7-grey",
  "/contact", "/faq", "/size-guide", "/condition-guide", "/cart", "/search?q=nike", "/search?q=zzzzqx", "/shipping", "/orders/lookup",
  "/account/login", "/account/register", "/account/forgot-password", "/does-not-exist",
]
const WIDTHS = [390, 1440]
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  return result.violations.map((item) => `${item.id} (${item.impact}, ${item.nodes.length}): ${item.nodes[0]?.target.join(" ")}`)
}

test.describe.configure({ mode: "parallel" })

for (const theme of ["light", "dark"] as const) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme })
    for (const width of WIDTHS) {
      for (const route of ROUTES) {
        test(`axe ${route} @ ${width}`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 })
          await page.goto(route, { waitUntil: "load" })
          await waitForHydration(page)
          expect(await violations(page)).toEqual([])
        })
      }
      for (const state of PANELS) {
        if (state === "closed" || !panelApplies(state, width)) continue
        test(`axe panel ${state} @ ${width}`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 })
          await page.goto("/", { waitUntil: "load" })
          await openPanel(page, state)
          expect(await violations(page)).toEqual([])
        })
      }
    }
  })
}

test("axe checkout with a pair in the bag", async ({ page }) => {
  await page.goto("/products/nike-air-max", { waitUntil: "load" })
  await waitForHydration(page)
  const size = page.getByRole("radio", { name: /42/ }).first()
  await size.focus()
  await page.keyboard.press("Space")
  await page.getByRole("button", { name: "Add to cart", exact: true }).click()
  await expect(page.getByRole("button", { name: "Bag, 1 item" })).toBeVisible()
  for (const route of ["/cart", "/checkout"]) {
    await page.goto(route, { waitUntil: "load" })
    await waitForHydration(page)
    await expect(page.getByText("NIKE Air Max").first()).toBeVisible()
    expect(await violations(page), route).toEqual([])
  }
})
