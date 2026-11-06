import { expect, test } from "@playwright/test"

import { signInAs } from "./support/admin"

/**
 * Every admin module page renders for the Owner without errors or CSP violations, and the
 * promotion simulator and rate tester answer (admin A4, A5). Chromium only.
 */
test.skip(({ browserName }) => browserName !== "chromium", "TOTP-limited demo accounts; covered once")

const PAGES = [
  ["/admin", /^Hello, DEMO/],
  ["/admin/orders", "Orders"],
  ["/admin/customers", "Customers"],
  ["/admin/products", "Products"],
  ["/admin/collections", "Collections"],
  ["/admin/inventory", "Inventory"],
  ["/admin/media", "Media"],
  ["/admin/promotions", "Promotions"],
  ["/admin/promotions/new", "New promotion"],
  ["/admin/shipping", "Shipping & tax"],
  ["/admin/payments", "Payments"],
  ["/admin/content", "Pages & FAQs"],
  ["/admin/content/faqs", "FAQs"],
  ["/admin/content/pages/new", "New page"],
  ["/admin/marketing", "Marketing"],
  ["/admin/marketing?view=abandoned", "Marketing"],
  ["/admin/search", "Search"],
  ["/admin/reports", "Reports"],
  ["/admin/staff", "Staff & roles"],
  ["/admin/staff/roles", "Roles"],
  ["/admin/staff/roles/new", "New role"],
  ["/admin/settings", "Settings"],
  ["/admin/settings?view=integrations", "Settings"],
  ["/admin/settings?view=outbox", "Settings"],
  ["/admin/settings?view=health", "Settings"],
  ["/admin/audit", "Audit log"],
  ["/admin/account", "Your account"],
] as const

test("the Owner can open every module, and the simulator and rate tester answer", async ({ page }) => {
  test.setTimeout(180_000)
  const problems: string[] = []
  await signInAs(page, "admin")
  // Listening starts after sign-in: a refused TOTP retry during sign-in is expected, not a page error.
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`${page.url()}: ${message.text()}`)
  })
  page.on("pageerror", (error) => problems.push(`${page.url()}: ${error.message}`))
  for (const [path, heading] of PAGES) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBe(200)
    await expect(page.getByRole("heading", { level: 1, name: heading }), path).toBeVisible()
  }

  await page.goto("/admin/promotions/new")
  await page.getByLabel("Title").fill("E2E ten percent")
  await page.getByRole("button", { name: "Run test" }).click()
  await expect(page.getByText("It applies.")).toBeVisible()

  await page.goto("/admin/shipping")
  await page.getByRole("button", { name: "Test", exact: true }).click()
  await expect(page.getByText(/^Zone: /)).toBeVisible()
  expect(problems).toEqual([])
})
