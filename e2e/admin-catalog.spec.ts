import { expect, test } from "@playwright/test"
import sharp from "sharp"

import { signInAs } from "./support/admin"

/**
 * Admin catalogue (A3) on the production build: a Store Manager uploads a photo, creates a draft
 * pair with sizes and prices, publishes it and sees it live on the storefront; stock is adjusted
 * with a reason. Chromium only (TOTP-limited demo accounts).
 */
test.skip(({ browserName }) => browserName !== "chromium", "TOTP-limited demo accounts; covered once")

test("a Store Manager creates, prices, photographs and publishes a pair, then adjusts its stock", async ({ page }) => {
  test.setTimeout(180_000)
  const suffix = Date.now().toString(36)
  const title = `E2E Runner ${suffix}`
  await signInAs(page, "store_manager", "/admin/products/new")
  await expect(page.getByRole("heading", { name: "New product" })).toBeVisible()

  await page.getByLabel("Title", { exact: true }).fill(title)
  await expect(page.getByLabel("Web address", { exact: true })).toHaveValue(`e2e-runner-${suffix}`)
  await page.getByLabel("Description", { exact: true }).fill("A pair made by the end-to-end suite.")
  await page.getByLabel("Brand", { exact: true }).selectOption({ index: 1 })
  await page.getByLabel("EU size, row 1").fill("42")
  await page.getByLabel("UK size, row 1").fill("8")
  await page.getByLabel("US size, row 1").fill("9")
  await page.getByLabel("SKU, row 1").fill(`E2E-${suffix}-42`)
  await page.getByLabel("Price, row 1", { exact: true }).fill("12999")

  // A photo from the media picker, uploaded on the spot.
  await page.getByRole("button", { name: "Add photos" }).click()
  const png = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 30, g: 30, b: 30 } } }).png().toBuffer()
  await page.getByLabel("Choose photos to upload").setInputFiles({ name: "e2e-shoe.png", mimeType: "image/png", buffer: png })
  await expect(page.getByRole("dialog").getByText("e2e-shoe.png")).toBeVisible()
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click()
  await expect(page.getByLabel("Alt text").first()).toBeVisible()
  await page.getByLabel("Alt text").first().fill("Black test runner, side view")

  await page.getByRole("button", { name: "Create draft" }).click()
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}$/)
  await expect(page.getByText("Draft", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Publish" }).click()
  await expect(page.getByText("Live", { exact: true })).toBeVisible()

  const slug = `e2e-runner-${suffix}`
  const live = await page.request.get(`/products/${slug}`)
  expect(live.status()).toBe(200)
  expect(await live.text()).toContain(title)
  // The photo is served as a sanitised WebP.
  const image = (await live.text()).match(/\/media\/[0-9a-f-]{36}\.webp/)?.[0]
  expect(image).toBeTruthy()
  const file = await page.request.get(image!)
  expect(file.headers()["content-type"]).toBe("image/webp")
  expect(file.headers()["x-content-type-options"]).toBe("nosniff")

  await page.goto(`/admin/inventory?q=${encodeURIComponent(`E2E-${suffix}`)}`)
  const row = page.getByRole("row", { name: new RegExp(title) })
  await row.getByRole("button", { name: "Adjust" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("How many").fill("5")
  await dialog.getByLabel("Reason").selectOption("Received from supplier")
  await dialog.getByRole("button", { name: "Save adjustment" }).click()
  await expect(row.getByRole("cell", { name: "5", exact: true }).first()).toBeVisible()
})

test("a Content Editor can't reach products, and the API agrees", async ({ page, baseURL }) => {
  await signInAs(page, "content_editor", "/admin/products")
  await expect(page).toHaveURL(/\/admin\/no-access\?need=products%3Aread/)
  expect((await page.request.get("/api/admin/products")).status()).toBe(403)
  const origin = new URL(baseURL ?? "http://127.0.0.1:3200").origin
  expect((await page.request.post("/api/admin/brands", { headers: { origin }, data: { name: "Nope" } })).status()).toBe(403)
  // Media is theirs, though.
  await page.goto("/admin/media")
  await expect(page.getByRole("heading", { name: "Media" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Choose photos", exact: true })).toBeVisible()
})
