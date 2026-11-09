import { expect, type Page } from "@playwright/test"
import { test } from "./support/test"

import { waitForHydration } from "./support/panels"
import { clientAddress } from "./support/admin"

/**
 * End-to-end shopper journeys (E2), each at a phone and a desktop width, against the production
 * build with the fixtures driver: payments are cash on delivery and email goes to the console
 * provider, so nothing leaves the machine.
 */
const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const

async function open(page: Page, route: string) {
  await page.goto(route, { waitUntil: "load" })
  await waitForHydration(page)
}

/** Picks a size chip the way a keyboard user does (the radio sits visually hidden behind it). */
async function pickSize(page: Page, size: string) {
  const radio = page.getByRole("radio", { name: new RegExp(`\\b${size}\\b`) }).first()
  await radio.focus()
  await page.keyboard.press("Space")
  await expect(radio).toBeChecked()
}

/**
 * Adds the first size that is still in stock. Product pages may show availability up to 60 s old
 * (docs/app/caching.md), so like a shopper the test moves on when the bag answers "sold out".
 */
async function addFirstAvailableSize(page: Page, sizes: string[]) {
  const soldOut = page.getByRole("status").filter({ hasText: "Sorry, that size just sold out." })
  const added = page.getByRole("button", { name: "Bag, 1 item" })
  for (const size of sizes) {
    await pickSize(page, size)
    await page.getByRole("button", { name: "Add to cart", exact: true }).click()
    await expect(added.or(soldOut)).toBeVisible()
    if (await added.isVisible()) return
  }
  throw new Error(`every size sold out: ${sizes.join(", ")}`)
}

const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`

for (const viewport of VIEWPORTS) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })
    // Each journey is a different shopper behind the one trusted proxy (TRUSTED_PROXY_HOPS=1), so
    // per-address rate limits apply per test exactly as they would per real visitor (BUG-015).
    test.beforeEach(async ({ page }) => {
      await page.setExtraHTTPHeaders({ "x-forwarded-for": clientAddress() })
    })

    test("guest browses, adds a pair, checks out with cash on delivery and finds the order again", async ({ page }) => {
      await open(page, "/collections/men")
      await page.getByRole("link", { name: /ASICS Gel-Kayano 30/i }).first().click()
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/Kayano/i)
      await waitForHydration(page)
      await addFirstAvailableSize(page, ["44", "43", "42", "41"])

      await open(page, "/cart")
      await expect(page.getByText(/Kayano/i).first()).toBeVisible()
      await page.getByRole("link", { name: "Proceed to Checkout" }).click()
      await expect(page.getByRole("heading", { name: "Checkout", level: 1 })).toBeVisible()
      await waitForHydration(page)

      const email = `guest-${unique()}@example.test`
      const form = page.getByRole("form", { name: "Checkout details" })
      await form.getByLabel("Email").fill(email)
      await form.getByLabel("Full name").fill("Ayesha Khan")
      await form.getByLabel("Mobile number").fill("03001234567")
      await form.getByLabel("House and street").fill("House 12, Street 4")
      await form.getByLabel("City").fill("Lahore")
      await form.getByLabel("Province").selectOption("Punjab")
      await form.getByLabel("City").blur()
      await expect(form.getByRole("radio", { name: /Cash on delivery/ })).toBeEnabled()
      await form.getByRole("radio").first().check()
      await form.getByRole("radio", { name: /Cash on delivery/ }).check()
      await page.getByRole("button", { name: /^Place order/ }).click()

      await expect(page.getByRole("heading", { name: "Thank you, Ayesha.", level: 1 })).toBeVisible({ timeout: 15_000 })
      const number = (await page.getByText(/SD\d{4,}/).first().textContent())?.match(/SD\d{4,}/)?.[0]
      expect(number).toBeTruthy()
      // Checkout pages show the bag as a plain link (no drawer over the order flow).
      await expect(page.getByRole("banner").getByRole("link", { name: "Bag, empty" })).toBeVisible()

      await open(page, "/orders/lookup")
      await page.getByLabel("Order number").fill(number!)
      await page.getByLabel("Email used at checkout").fill(email)
      await page.getByRole("button", { name: /find|look up|track/i }).click()
      await expect(page.getByRole("heading", { name: `Order ${number}`, level: 1 })).toBeVisible()
    })

    test("order lookup refuses an unknown order without revealing whether it exists", async ({ page }) => {
      await open(page, "/orders/lookup")
      await page.getByLabel("Order number").fill("SD99999")
      await page.getByLabel("Email used at checkout").fill("nobody@example.test")
      await page.getByRole("button", { name: /find|look up|track/i }).click()
      await expect(page.getByRole("alert").filter({ hasText: /./ })).toBeVisible()
      await expect(page).toHaveURL(/\/orders\/lookup/)
    })

    test("shopper creates an account, signs out and signs back in", async ({ page }) => {
      const email = `member-${unique()}@example.test`
      await open(page, "/account/register")
      await page.getByLabel("Full name").fill("Bilal Ahmed")
      await page.getByRole("textbox", { name: "Email" }).fill(email)
      await page.getByLabel("Password", { exact: true }).fill("solEdrop2026")
      await page.getByRole("button", { name: "Create account" }).click()
      await expect(page).toHaveURL(/\/account$/)
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/Bilal/)

      await page.getByRole("button", { name: /^Account/ }).click()
      await page.getByRole("dialog").getByRole("button", { name: "Sign out" }).click()
      // The account page needs a session, so signing out there lands on the sign-in page.
      await expect(page).toHaveURL(/\/account\/login/)
      await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible()
      await waitForHydration(page)
      await page.getByLabel("Email").fill(email)
      await page.getByLabel("Password", { exact: true }).fill("solEdrop2026")
      await page.getByRole("button", { name: "Sign in" }).click()
      await expect(page).toHaveURL(/\/account$/)
    })

    test("sign-in failure is generic and the account page needs a session", async ({ page }) => {
      await open(page, "/account")
      await expect(page).toHaveURL(/\/account\/login/)
      await waitForHydration(page)
      await page.getByLabel("Email").fill(`nobody-${unique()}@example.test`)
      await page.getByLabel("Password", { exact: true }).fill("wrongPassword1")
      await page.getByRole("button", { name: "Sign in" }).click()
      // One message for an unknown email and a wrong password (no account enumeration).
      await expect(page.getByRole("alert").filter({ hasText: "That email and password don't match." })).toBeVisible()
    })

    test("search from the header leads to a product page", async ({ page }) => {
      await open(page, "/")
      await page.getByRole("button", { name: "Search" }).click()
      await page.getByRole("combobox").fill("bondi")
      await page.keyboard.press("Enter")
      await expect(page).toHaveURL(/\/search\?q=bondi/)
      await expect(page.getByRole("status").filter({ hasText: /pairs? found/ })).toBeVisible()
      await page.getByRole("main").getByRole("link", { name: /Bondi/i }).first().click()
      await expect(page).toHaveURL(/\/products\/hoka-bondi/)
    })

    test("contact form validates, then sends", async ({ page }) => {
      await open(page, "/contact")
      await page.getByRole("button", { name: "Send message" }).click()
      await expect(page.getByLabel("Full Name")).toHaveAttribute("aria-invalid", "true")
      await page.getByLabel("Full Name").fill("Sara Malik")
      await page.getByRole("textbox", { name: "Email" }).fill(`sara-${unique()}@example.test`)
      await page.getByRole("textbox", { name: "Message" }).fill("Do you have the Gel-Kayano 30 in EU 45?")
      await page.getByRole("button", { name: "Send message" }).click()
      await expect(page.getByRole("status").filter({ hasText: "Message sent" })).toBeVisible()
    })
  })
}
