import { expect } from "@playwright/test"
import { test } from "./support/test"

import { signInAs } from "./support/admin"
import { waitForHydration } from "./support/panels"

test("staff can choose complete artwork for homepage and page banners", async ({ page }) => {
  await signInAs(page, "admin", "/admin/banners")
  await expect(page.getByText(/complete banner artwork with its words inside the image/i)).toBeVisible()

  await page.getByRole("link", { name: "Edit homepage banners" }).click()
  await waitForHydration(page)
  await expect(page.getByRole("button", { name: "Upload or choose complete banner image" })).toBeVisible()
  await expect(page.getByLabel("Heading line 1")).toHaveCount(0)
  await page.getByRole("button", { name: "Upload or choose complete banner image" }).click()
  await expect(page.getByRole("dialog").getByLabel("Choose photos to upload")).toBeAttached()
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click()

  await page.goto("/admin/banners")
  await page.getByRole("link", { name: /^Edit .* banner$/ }).first().click()
  await waitForHydration(page)
  await expect(page.getByRole("button", { name: "Upload or choose complete banner image" })).toBeVisible()
  await expect(page.getByLabel("Headline, first line")).toHaveCount(0)
  const collectionId = new URL(page.url()).pathname.split("/").at(-1)!
  const collectionBeforeResponse = await page.request.get(`/api/admin/collections/${collectionId}`)
  expect(collectionBeforeResponse.ok()).toBe(true)
  const collectionSnapshot = await collectionBeforeResponse.json()
  const collectionBefore = collectionSnapshot.collection

  // Publish to the isolated QA store, verify the public image, then restore its original content.
  const beforeResponse = await page.request.get("/api/admin/content/home")
  expect(beforeResponse.ok()).toBe(true)
  const before = (await beforeResponse.json()).home
  expect(before).toBeTruthy()
  let collectionChanged = false
  try {
    await page.goto("/admin/content/home")
    await waitForHydration(page)
    await page.getByRole("button", { name: "Upload or choose complete banner image" }).click()
    const upload = page.waitForResponse((response) => response.url().endsWith("/api/admin/media") && response.request().method() === "POST")
    await page.getByRole("dialog").getByLabel("Choose photos to upload").setInputFiles("public/images/site/why-sole-drop.png")
    const uploadResponse = await upload
    expect(uploadResponse.status()).toBe(201)
    const uploaded = (await uploadResponse.json()).item
    const heroDescription = page.getByLabel(/Banner \d+ image description \(screen readers\)/).first()
    await expect(heroDescription).toBeVisible()
    await heroDescription.fill("Sole Drop complete hero artwork")
    await page.getByRole("dialog").getByRole("button", { name: "Done" }).click()
    await page.getByRole("button", { name: "Save & publish homepage" }).click()
    await expect(page.getByText("Homepage saved and published.")).toBeVisible()

    await page.goto("/")
    const banner = page.locator('section[aria-label="Homepage banners"]')
    await expect(banner).toBeVisible()
    await expect(banner.locator("img")).toHaveCount(1)
    await expect(page.locator('section[aria-labelledby="hero-title"]')).toHaveCount(0)
    await expect.poll(() => banner.locator("img").evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    const ratios = await banner.locator("img").evaluate((image) => {
      const img = image as HTMLImageElement
      return { displayed: img.getBoundingClientRect().width / img.getBoundingClientRect().height, original: img.naturalWidth / img.naturalHeight }
    })
    expect(Math.abs(ratios.displayed - ratios.original)).toBeLessThan(0.02)

    expect(before.content.categories.length).toBeGreaterThan(0)
    await page.goto("/admin/content/home")
    await waitForHydration(page)
    await page.getByRole("button", { name: "Replace category 1 banner" }).click()
    await page.getByRole("dialog").getByRole("button", { name: /why-sole-drop\.png/ }).first().click()
    await page.getByLabel("Category 1 image description (screen readers)").fill("Complete category artwork")
    await page.getByRole("button", { name: "Save & publish homepage" }).click()
    await expect(page.getByText("Homepage saved and published.")).toBeVisible()
    await page.goto("/")
    const categoryBanner = page.locator('section[aria-labelledby="categories-title"] li').first()
    await expect(categoryBanner.locator("img")).toBeVisible()
    await expect(categoryBanner.locator("h3")).toHaveCount(0)

    const changed = await page.request.put(`/api/admin/collections/${collectionId}`, {
      headers: { origin: new URL(page.url()).origin },
      data: { ...collectionBefore, productIds: collectionSnapshot.productIds, image: { url: uploaded.url, alt: "Complete collection artwork", width: uploaded.width, height: uploaded.height, mode: "full" } },
    })
    expect(changed.status(), await changed.text()).toBe(200)
    collectionChanged = true
    const slug = collectionBefore.slug as string
    const route = slug === "new-arrivals" ? "/new-arrivals" : slug === "pre-loved" ? "/pre-loved" : slug === "sale" ? "/sale" : `/collections/${slug}`
    await page.goto(route)
    const collectionBanner = page.locator("div.overflow-hidden.rounded-3xl.bg-foreground > img").first()
    await expect(collectionBanner).toBeVisible()
    await expect(collectionBanner).toHaveAttribute("alt", "Complete collection artwork")
    await expect(collectionBanner.locator("xpath=..").locator("p")).toHaveCount(0)
  } finally {
    if (collectionChanged) {
      const restoredCollection = await page.request.put(`/api/admin/collections/${collectionId}`, {
        headers: { origin: new URL(page.url()).origin },
        data: { ...collectionBefore, productIds: collectionSnapshot.productIds },
      })
      expect(restoredCollection.status()).toBe(200)
    }
    const latestResponse = await page.request.get("/api/admin/content/home")
    const latest = (await latestResponse.json()).home
    const restored = await page.request.put("/api/admin/content/home", {
      headers: { origin: new URL(page.url()).origin },
      data: { content: before.content, expectedUpdatedAt: latest.updatedAt },
    })
    expect(restored.status()).toBe(200)
  }
})
