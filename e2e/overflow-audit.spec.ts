import { expect } from "@playwright/test"
import { test } from "./support/test"

import { AUDIT_ROUTES, AUDIT_WIDTHS, auditLayout } from "./support/layout-audit"
import { openPanel, PANELS, panelApplies } from "./support/panels"

/**
 * Overflow & containment audit. Matrix:
 * - every route × every width, closed header, light and dark theme;
 * - every header panel state × every width on the routes with distinct header contexts
 *   (home, a listing, a product page, search results), light; dark at a phone and a desktop width.
 * A violation lists the element and the boxes involved, so the failure message is the bug report.
 */
test.describe.configure({ mode: "parallel" })

const PANEL_ROUTES = ["/", "/collections/men", "/products/asics-gel-kayano-30-black-silver", "/search?q=nike"]
const DARK_PANEL_WIDTHS = [390, 1440]

const viewport = (width: number) => ({ width, height: width < 768 ? 800 : 1000 })

for (const theme of ["light", "dark"] as const) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme })

    for (const width of AUDIT_WIDTHS) {
      for (const route of AUDIT_ROUTES) {
        test(`containment ${route} @ ${width} closed`, async ({ page }) => {
          await page.setViewportSize(viewport(width))
          await page.goto(route, { waitUntil: "load" })
          await page.evaluate(() => document.fonts.ready)
          expect(await auditLayout(page)).toEqual([])
        })
      }

      if (theme === "dark" && !DARK_PANEL_WIDTHS.includes(width)) continue
      for (const route of PANEL_ROUTES) {
        for (const state of PANELS) {
          if (state === "closed" || !panelApplies(state, width)) continue
          test(`containment ${route} @ ${width} ${state}`, async ({ page }) => {
            await page.setViewportSize(viewport(width))
            await page.goto(route, { waitUntil: "load" })
            await page.evaluate(() => document.fonts.ready)
            await openPanel(page, state)
            expect(await auditLayout(page)).toEqual([])
          })
        }
      }
    }
  })
}
