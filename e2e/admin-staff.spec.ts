import { expect } from "@playwright/test"
import { test } from "./support/test"

import { totpAt } from "../server/admin/totp"
import { clientAddress, signInAs } from "./support/admin"

/**
 * Staff lifecycle (admin A1 + A9) on the production build: an Owner invites a new member, who sets a
 * password, enrols TOTP from the QR key, keeps the recovery codes and lands in the admin with only
 * their role's modules; the Owner then suspends them and their session ends. Also the ⌘K palette.
 */
test.skip(({ browserName }) => !process.env.QA_STAFF_FILE && browserName !== "chromium", "Shared demo TOTP accounts; isolated QA runs every browser")

test("an invited member enrols two-step verification, works, and is locked out when suspended", async ({ page, browser }) => {
  test.setTimeout(180_000)
  const suffix = Date.now().toString(36)
  const email = `new-${suffix}@example.test`
  const name = `Faraz ${suffix}`
  await signInAs(page, "owner", "/admin/staff")
  await page.getByRole("button", { name: "Invite" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Their work email").fill(email)
  await dialog.getByLabel("Role").selectOption({ label: "Fulfilment" })
  const inviteResponse = page.waitForResponse((response) => response.url().endsWith("/api/admin/staff/invites") && response.request().method() === "POST")
  await dialog.getByRole("button", { name: "Create invite" }).click()
  expect((await inviteResponse).status()).toBe(201)
  const link = (await dialog.locator("code").textContent())?.trim() ?? ""
  expect(link).toMatch(/\/admin\/invite\/[\w-]{43}$/)
  await dialog.getByRole("button", { name: "Done" }).click()

  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": clientAddress() } })
  const invited = await context.newPage()
  await invited.goto(link)
  await expect(invited.getByRole("heading", { name: "Join the Sole Drop team" })).toBeVisible()
  await invited.getByLabel("Your name").fill(name)
  await invited.getByLabel("Choose a password").fill("a long and memorable passphrase")
  await invited.getByRole("button", { name: "Create account" }).click()
  await expect(invited).toHaveURL(/\/admin\/mfa\/setup/)
  // An AAL1 session can't reach the admin yet.
  expect((await invited.request.get("/api/admin/me")).status()).toBe(401)
  const key = ((await invited.locator("code").first().textContent()) ?? "").replace(/\s/g, "")
  expect(key).toMatch(/^[A-Z2-7]{32}$/)
  await invited.getByLabel("6-digit code").fill(totpAt(key, Date.now()))
  await invited.getByRole("button", { name: "Turn on two-step verification" }).click()
  await expect(invited.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible()
  await expect(invited.getByRole("list", { name: "Recovery codes" }).getByRole("listitem")).toHaveCount(10)
  const go = invited.getByRole("button", { name: "Go to the admin" })
  await expect(go).toBeDisabled()
  await invited.getByLabel("I've saved these codes").check()
  await go.click()
  await expect(invited.getByRole("heading", { name: `Hello, ${name}` })).toBeVisible()
  const nav = invited.getByRole("navigation", { name: "Admin" }).first()
  await expect(nav.getByRole("link", { name: "Orders" })).toBeVisible()
  await expect(nav.getByRole("link", { name: "Staff & roles" })).toHaveCount(0)

  // The Owner suspends them; their open session stops working at once.
  await page.goto("/admin/staff")
  await page.getByRole("link", { name }).click()
  await page.getByRole("button", { name: "Suspend" }).click()
  await page.getByRole("dialog").getByLabel(/Reason/).fill("Test of suspension")
  await page.getByRole("dialog").getByRole("button", { name: "Suspend" }).click()
  await expect(page.getByText("suspended", { exact: true })).toBeVisible()
  expect((await invited.request.get("/api/admin/me")).status()).toBe(401)
  await invited.goto("/admin")
  await expect(invited).toHaveURL(/\/admin\/login/)
  await context.close()

  // The audit log recorded it, with the reason.
  await page.goto("/admin/audit?entity=staff")
  await expect(page.getByText("staff.suspended").first()).toBeVisible()
})

test("Ctrl+K jumps to a page from anywhere", async ({ page }) => {
  await signInAs(page, "read_only", "/admin")
  const box = page.getByRole("combobox", { name: /Search pages/ })
  // The shortcut works once the page has hydrated; keep pressing until the palette opens.
  await expect(async () => {
    await page.keyboard.press("Control+k")
    await expect(box).toBeFocused({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
  await box.fill("invent")
  // Wait for the search to settle (results follow the typing after a short pause).
  await expect(page.getByRole("option").first()).toHaveText(/Inventory/)
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/admin\/inventory$/)
  await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible()
})
