import { expect } from "@playwright/test"
import { test } from "./support/test"

import { signInAs } from "./support/admin"

test("staff can remove an unused brand from the admin list and product dropdown", async ({ page }) => {
  await signInAs(page, "admin", "/admin/brands")
  const name = `QA Brand ${Date.now()}`
  const created = await page.request.post("/api/admin/brands", { headers: { origin: new URL(page.url()).origin }, data: { name } })
  expect(created.status(), await created.text()).toBe(201)
  const { brand } = await created.json()

  await page.reload()
  await expect(page.getByRole("heading", { name: "Brands", exact: true })).toBeVisible()
  await page.getByRole("button", { name: `Delete ${name} brand` }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText(`Type ${brand.slug} to confirm`)).toBeVisible()
  await dialog.getByLabel(`Type ${brand.slug} to confirm`).fill(brand.slug)
  const deleted = page.waitForResponse((response) => response.url().endsWith(`/api/admin/brands/${brand.id}`) && response.request().method() === "DELETE")
  await dialog.getByRole("button", { name: "Delete brand" }).click()
  expect((await deleted).status()).toBe(204)
  await expect(page.getByRole("button", { name: `Delete ${name} brand` })).toHaveCount(0)

  await page.getByRole("button", { name: "Delete Nike brand" }).click()
  await dialog.getByLabel("Type nike to confirm").fill("nike")
  const refused = page.waitForResponse((response) => response.url().includes("/api/admin/brands/") && response.request().method() === "DELETE")
  await dialog.getByRole("button", { name: "Delete brand" }).click()
  expect((await refused).status()).toBe(409)
  await expect(dialog.getByText("This brand is used by products. Change those products to another brand first.")).toBeVisible()
  await dialog.getByRole("button", { name: "Cancel" }).click()

  await page.goto("/admin/products/new")
  await expect(page.getByRole("link", { name: "Manage brands" })).toHaveAttribute("href", "/admin/brands")
  await expect(page.getByLabel("Brand").getByRole("option", { name })).toHaveCount(0)
})
