import { expect } from "@playwright/test"
import { test } from "./support/test"
import { waitForHydration } from "./support/panels"

test("product photos zoom on hover and navigate in the full-screen viewer", async ({ page }) => {
  await page.goto("/products/asics-gel-kayano-30-black-silver")
  await waitForHydration(page)
  const photos = page.getByRole("group", { name: "ASICS Gel-Kayano 30 photos" }).getByRole("button")
  await expect(photos).toHaveCount(6)
  const main = page.getByRole("button", { name: "Enlarge photo 1 of 6 of ASICS Gel-Kayano 30" })
  await main.hover({ position: { x: 180, y: 180 } })
  expect(await main.locator("img").evaluate((image) => getComputedStyle(image).transform)).not.toBe("none")

  await page.getByRole("button", { name: "Next product photo" }).first().click()
  await expect(page.getByRole("button", { name: "Enlarge photo 2 of 6 of ASICS Gel-Kayano 30" })).toBeVisible()
  await photos.nth(5).click()
  await page.getByRole("button", { name: "Enlarge photo 6 of 6 of ASICS Gel-Kayano 30" }).click()

  const viewer = page.getByRole("dialog", { name: "ASICS Gel-Kayano 30 image viewer" })
  await expect(viewer).toBeVisible()
  await page.keyboard.press("ArrowRight")
  await expect(viewer.getByText("Photo 1 of 6")).toBeVisible()
  await viewer.getByRole("button", { name: "Show photo 3 of 6 in viewer" }).click()
  await expect(viewer.getByText("Photo 3 of 6")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(viewer).toBeHidden()
  await expect(page.getByRole("button", { name: "Enlarge photo 3 of 6 of ASICS Gel-Kayano 30" })).toBeFocused()
})

test("single-image product opens and closes its viewer on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/products/adidas-duramo-sl-core-black")
  await waitForHydration(page)
  await page.getByRole("button", { name: "Enlarge photo 1 of 1 of ADIDAS Duramo SL" }).click()
  const viewer = page.getByRole("dialog", { name: "ADIDAS Duramo SL image viewer" })
  await expect(viewer).toBeVisible()
  await expect(viewer.getByRole("button", { name: "Next product photo" })).toHaveCount(0)
  await viewer.getByRole("button", { name: "Close image viewer" }).click()
  await expect(viewer).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth))
})
