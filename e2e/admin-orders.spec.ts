import { expect, type APIRequestContext } from "@playwright/test"
import { test } from "./support/test"

import { openingStock } from "../server/fixtures/seed"
import { signInAs, staffHeaders } from "./support/admin"

/**
 * Admin orders (A2) on the production build: staff find a real storefront order, move it through
 * packing and shipping, cancel another with a typed confirmation, and see contact details only
 * when their role allows. Chromium only: each run signs demo accounts in with TOTP.
 */
test.skip(({ browserName }) => !process.env.QA_STAFF_FILE && browserName !== "chromium", "Shared demo TOTP accounts; isolated QA runs every browser")

async function placeOrder(request: APIRequestContext, baseURL: string | undefined, fullName: string) {
  const headers = staffHeaders(baseURL)
  const stocked = openingStock.filter((row) => row.onHand > 0)
  for (const row of stocked.slice(Math.floor(Math.random() * Math.min(stocked.length, 20)))) {
    const added = await request.post("/api/cart", { headers, data: { variantId: row.variantId, quantity: 1 } })
    if (!added.ok()) continue
    const placed = await request.post("/api/checkout", {
      headers: { ...headers, "idempotency-key": `e2e-admin-${crypto.randomUUID()}` },
      data: {
        email: `${fullName.split(" ")[0].toLowerCase()}@example.test`,
        address: { fullName, phone: "03001234567", line1: "House 12, Street 4", city: "Lahore", province: "Punjab", country: "PK" },
        shippingCode: "standard",
        paymentMethod: "cod",
      },
    })
    if (placed.ok()) return ((await placed.json()) as { order: { number: string } }).order.number
  }
  throw new Error("No stock left to place an order")
}

test("Fulfilment finds an order, packs it and ships it with a tracking number", async ({ page, request, baseURL }) => {
  const number = await placeOrder(request, baseURL, "Hamza Packer")
  await signInAs(page, "fulfilment", "/admin/orders?view=to-pack")
  await page.getByLabel("Search orders").fill(number)
  await page.getByRole("button", { name: "Apply" }).click()
  await expect(page).toHaveURL(new RegExp(`q=${number}`))
  await page.getByRole("link", { name: number, exact: true }).click()
  await expect(page.getByRole("heading", { name: `Order ${number}` })).toBeVisible()

  // Fulfilment can't take payment, refund or cancel.
  await expect(page.getByRole("button", { name: "Record payment" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Refund" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0)

  await page.getByRole("button", { name: "Start packing" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Start packing" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByText("To pack → Packing")).toBeVisible()

  await page.getByRole("button", { name: "Mark shipped" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Courier tracking number").fill("TCS-778899")
  await dialog.getByRole("button", { name: "Mark shipped" }).click()
  await expect(page.getByText("Packing → Shipped")).toBeVisible()
  await expect(page.getByText("TCS-778899")).toBeVisible()
  await expect(page.getByRole("button", { name: "Mark delivered" })).toBeVisible()
})

test("a Support Agent cancels an order only after typing its number and giving a reason", async ({ page, request, baseURL }) => {
  const number = await placeOrder(request, baseURL, "Sana Cancel")
  await signInAs(page, "support_agent", `/admin/orders/${number}`)
  await page.getByRole("button", { name: "Cancel order" }).click()
  const dialog = page.getByRole("dialog")
  const confirm = dialog.getByRole("button", { name: "Cancel order" })
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(/Type .* to confirm/).fill(number)
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(/Reason/).fill("Customer changed their mind")
  await confirm.click()
  await expect(page.getByText("To pack → Cancelled")).toBeVisible()
  await expect(page.getByText(/Customer changed their mind/)).toBeVisible()
  await page.getByLabel("Add a staff note").fill("Refund not needed: cash on delivery.")
  await page.getByRole("button", { name: "Add note" }).click()
  await expect(page.getByText("Refund not needed: cash on delivery.")).toBeVisible()
})

test("Read-only staff see orders with contact details hidden and no actions", async ({ page, request, baseURL }) => {
  const number = await placeOrder(request, baseURL, "Zara Private")
  await signInAs(page, "read_only", `/admin/orders?q=${number}`)
  await expect(page.getByText("z•••@example.test")).toBeVisible()
  await page.getByRole("link", { name: number, exact: true }).click()
  await expect(page.getByText("Contact details are hidden for your role.")).toBeVisible()
  await expect(page.getByText("Nothing for you to do on this order.")).toBeVisible()
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveCount(0)
  expect((await page.request.get("/api/admin/orders/export")).status()).toBe(403)
  const transition = await page.request.post(`/api/admin/orders/${number}/transition`, { headers: staffHeaders(baseURL), data: { to: "cancelled", reason: "x" } })
  expect(transition.status()).toBe(403)
})
