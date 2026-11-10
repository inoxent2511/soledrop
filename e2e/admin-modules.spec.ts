import { expect } from "@playwright/test"
import { test } from "./support/test"

import { signInAs } from "./support/admin"
import { waitForHydration } from "./support/panels"

/**
 * Every admin module page renders for the Owner without errors or CSP violations, and the
 * promotion simulator and rate tester answer (admin A4, A5). Chromium only.
 */
test.skip(({ browserName }) => !process.env.QA_STAFF_FILE && browserName !== "chromium", "Shared demo TOTP accounts; isolated QA runs every browser")

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
  ["/admin/banners", "Banners & images"],
  ["/admin/content/home", "Homepage banners"],
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
  ["/admin/dev/gallery", "Component gallery"],
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
  page.on("response", (response) => { if (response.status() >= 400) problems.push(`${new URL(response.url()).pathname}: HTTP ${response.status()}`) })
  // The first full navigation also leaves the page reached by sign-in. Its
  // header effects must settle under the same audit as the subsequent pages.
  await waitForHydration(page)
  await page.waitForLoadState("networkidle")
  for (const [path, heading] of PAGES) {
    const response = await page.goto(path, { waitUntil: "networkidle" })
    expect(response?.status(), path).toBe(200)
    await expect(page.getByRole("heading", { level: 1, name: heading }), path).toBeVisible()
    await waitForHydration(page)
    await page.waitForLoadState("networkidle")
  }

  await page.goto("/admin/promotions/new", { waitUntil: "networkidle" })
  await page.getByLabel("Title").fill("E2E ten percent")
  await page.getByRole("button", { name: "Run test" }).click()
  await expect(page.getByText("It applies.", { exact: true })).toBeVisible()

  await page.goto("/admin/shipping", { waitUntil: "networkidle" })
  await page.getByRole("button", { name: "Test", exact: true }).click()
  await expect(page.getByText(/^Zone: /)).toBeVisible()

  await page.goto("/admin/dev/gallery", { waitUntil: "networkidle" })
  const writes: string[] = []
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url())
  })
  await page.getByRole("button", { name: "ConfirmDialog", exact: true }).click()
  const confirmation = page.getByRole("dialog", { name: "Cancel SD10001?" })
  await expect(confirmation.getByRole("button", { name: "Cancel order", exact: true })).toBeDisabled()
  await confirmation.getByLabel("Type SD10001 to confirm").fill("SD10001")
  await confirmation.getByLabel("Reason", { exact: true }).fill("Gallery example")
  await confirmation.getByRole("button", { name: "Cancel order", exact: true }).click()
  await expect(confirmation).toBeHidden()
  await page.getByRole("button", { name: "FormDialog", exact: true }).click()
  const form = page.getByRole("dialog", { name: "A form in a dialog" })
  await form.getByLabel("A field").fill("Sample value")
  await form.getByRole("button", { name: "Save", exact: true }).click()
  await expect(form).toBeHidden()
  await page.getByRole("button", { name: "Add rule", exact: true }).click()
  await expect(page.getByLabel("Rule 2", { exact: true })).toBeVisible()
  expect(writes).toEqual([])
  expect(problems).toEqual([])
})
