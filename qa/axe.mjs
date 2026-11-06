#!/usr/bin/env node
/**
 * Accessibility gate: axe-core (WCAG 2.0/2.1/2.2 A + AA rules) on every storefront route at desktop
 * and mobile widths. Exits 1 on any violation. Usage: node qa/axe.mjs [--base=http://127.0.0.1:3200]
 */
import AxeBuilder from "@axe-core/playwright"
import { chromium } from "@playwright/test"

const base = process.argv.find((arg) => arg.startsWith("--base="))?.slice(7) ?? "http://127.0.0.1:3200"
const routes = [
  "/", "/new-arrivals", "/sale", "/terms", "/privacy", "/returns", "/collections/new-arrivals", "/pre-loved", "/products/asics-gel-kayano-30-black-silver", "/products/hoka-bondi-7-grey",
  "/contact", "/faq", "/size-guide", "/cart", "/search?q=nike", "/shipping", "/orders/lookup",
  "/account/login", "/account/register", "/account/forgot-password", "/does-not-exist",
]

const browser = await chromium.launch()
let violations = 0
for (const width of [1920, 390]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" })
  const page = await context.newPage()
  for (const route of routes) {
    await page.goto(base + route, { waitUntil: "networkidle" })
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()
    violations += result.violations.length
    const summary = result.violations.map((item) => `${item.id} (${item.impact}, ${item.nodes.length}): ${item.nodes[0]?.target.join(" ")}`)
    console.log(`${width} ${route.padEnd(46)} ${summary.length ? "✗ " + summary.join(" | ") : "✓"}`)
  }
  await context.close()
}
await browser.close()
console.log(violations ? `${violations} violation(s)` : "no violations")
process.exit(violations ? 1 : 0)
