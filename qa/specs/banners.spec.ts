import { expect, test } from "@playwright/test"
import sharp from "sharp"
import AxeBuilder from "@axe-core/playwright"

import { signInAs, staffHeaders } from "../../e2e/support/admin"

test("banner editors publish homepage and every collection banner, with guarded media deletion", async ({ page, baseURL }) => {
  await signInAs(page, "owner", "/admin/banners")
  const beforeHome = (await (await page.request.get("/api/admin/content/home")).json()).home
  await expect(page.getByRole("link", { name: "Banners & images", exact: true })).toBeVisible()
  await page.getByRole("link", { name: "Edit homepage banners" }).click()
  await expect(page.getByRole("heading", { name: "Homepage banners" })).toBeVisible()
  const filename = `banner-qa-${Date.now()}.png`
  const png = await sharp({ create: { width: 800, height: 400, channels: 3, background: "navy" } }).png().toBuffer()
  await page.getByRole("button", { name: "Replace hero photo 1", exact: true }).click()
  await page.getByLabel("Choose photos to upload").setInputFiles({ name: filename, mimeType: "image/png", buffer: png })
  await expect(page.getByRole("dialog")).toHaveCount(0)
  const alt = `Managed hero ${Date.now()}`
  await page.getByLabel("Hero photo 1 alt text", { exact: true }).fill(alt)
  await page.getByLabel("Announcement", { exact: true }).fill("Banner QA announcement")
  await page.getByRole("button", { name: "Add category photo", exact: true }).click()
  await page.getByRole("dialog").getByRole("searchbox", { name: "Search photos" }).fill(filename)
  await page.getByRole("dialog").getByRole("button").filter({ has: page.getByText(filename, { exact: true }) }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click()
  await expect(page.getByLabel(`Category ${beforeHome.content.categories.length + 1} link`, { exact: true })).toHaveValue("/new-arrivals")
  await page.getByRole("button", { name: "Save & publish homepage" }).click()
  await expect(page.getByRole("status")).toHaveText("Homepage saved and published.")
  const home = (await (await page.request.get("/api/admin/content/home")).json()).home
  const imageUrl = home.content.slides[0].src as string
  expect(imageUrl).toMatch(/^\/media\/[0-9a-f-]{36}\.webp$/)
  const publicPage = await page.context().newPage()
  await publicPage.goto("/")
  await expect(publicPage.getByText("Banner QA announcement", { exact: true })).toBeVisible()
  await publicPage.getByRole("button", { name: "Show slide 1", exact: true }).click()
  await expect(publicPage.getByAltText(alt, { exact: true })).toBeVisible()
  expect(decodeURIComponent((await publicPage.getByAltText(alt).getAttribute("src"))!)).toContain(imageUrl)
  const image = await page.request.get(imageUrl)
  expect(image.status()).toBe(200)
  expect(image.headers()["content-type"]).toBe("image/webp")
  const headers = staffHeaders(baseURL)
  const imageId = imageUrl.split("/").pop()!.replace(".webp", "")
  expect((await page.request.delete(`/api/admin/media/${imageId}`, { headers })).status()).toBe(409)

  // The same image picker serves the dedicated pages and regular collection pages.
  const { collections } = await (await page.request.get("/api/admin/collections")).json()
  for (const [slug, pathname] of [["new-arrivals", "/new-arrivals"], ["pre-loved", "/pre-loved"], ["sale", "/sale"], ["men", "/collections/men"]]) {
    const collection = collections.find((row: { slug: string }) => row.slug === slug)
    expect(collection, slug).toBeTruthy()
    await page.goto(`/admin/collections/${collection.id}`)
    await page.getByRole("button", { name: "Choose banner image", exact: true }).click()
    await page.getByRole("dialog").getByRole("searchbox", { name: "Search photos" }).fill(filename)
    await page.getByRole("dialog").getByRole("button").filter({ has: page.getByText(filename, { exact: true }) }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await page.getByLabel("Banner alt text", { exact: true }).fill(`Managed ${slug} banner`)
    const save = page.waitForResponse((response) => response.url().endsWith(`/api/admin/collections/${collection.id}`) && response.request().method() === "PUT")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    expect((await save).status()).toBe(200)
    await publicPage.goto(pathname)
    await expect(publicPage.getByAltText(`Managed ${slug} banner`, { exact: true })).toBeVisible()
    expect(decodeURIComponent((await publicPage.getByAltText(`Managed ${slug} banner`).getAttribute("src"))!)).toContain(imageUrl)
  }
  // Homepage removal must not permit deleting an image still used by a page banner.
  const removeHome = await page.request.put("/api/admin/content/home", { headers, data: { content: { ...home.content, slides: [] }, expectedUpdatedAt: home.updatedAt } })
  expect(removeHome.status()).toBe(200)
  expect((await page.request.delete(`/api/admin/media/${imageId}`, { headers })).status()).toBe(409)
  const stale = await page.request.put("/api/admin/content/home", { headers, data: { content: home.content, expectedUpdatedAt: home.updatedAt } })
  expect(stale.status()).toBe(409)
  const removed = await removeHome.json()
  expect((await page.request.put("/api/admin/content/home", { headers, data: { content: beforeHome.content, expectedUpdatedAt: removed.updatedAt } })).status()).toBe(200)
  await publicPage.close()
  // More than one page of uploads must remain reachable from the picker.
  for (let index = 0; index < 41; index++) {
    const upload = await page.request.post("/api/admin/media", { headers, multipart: { file: { name: `library-page-${index}-${Date.now()}.png`, mimeType: "image/png", buffer: png } } })
    expect(upload.status()).toBe(201)
  }
  await page.reload()
  await page.getByRole("button", { name: "Choose banner image", exact: true }).click()
  await page.getByRole("dialog").getByRole("searchbox", { name: "Search photos" }).fill("")
  await page.getByRole("button", { name: "Next photos", exact: true }).click()
  await expect(page.getByRole("dialog").getByText(filename, { exact: true })).toBeVisible()
  await page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click()
  await page.goto("/admin/media")
  await page.getByLabel("Search photos", { exact: true }).fill(filename)
  await page.getByRole("button").filter({ has: page.getByText(filename, { exact: true }) }).click()
  await expect(page.getByRole("dialog").getByText("Used by", { exact: true })).toBeVisible()
  await expect(page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true })).toBeDisabled()
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click()
})

test("read-only staff see banner settings but cannot publish or upload", async ({ page, baseURL }) => {
  await signInAs(page, "read_only", "/admin/content/home")
  await expect(page.getByRole("heading", { name: "Homepage banners" })).toBeVisible()
  await expect(page.getByLabel("Announcement", { exact: true })).toBeDisabled()
  await expect(page.getByRole("button", { name: "Save & publish homepage" })).toHaveCount(0)
  const home = (await (await page.request.get("/api/admin/content/home")).json()).home
  expect((await page.request.put("/api/admin/content/home", { headers: staffHeaders(baseURL), data: { content: home.content, expectedUpdatedAt: home.updatedAt } })).status()).toBe(403)
})

test("banner settings fit mobile screens and pass automated accessibility checks", async ({ page }) => {
  await signInAs(page, "content_editor", "/admin/banners")
  for (const url of ["/admin/banners", "/admin/content/home"]) {
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(url)
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${url} at ${width}`).toBe(width)
      const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()
      expect(audit.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) }))).toEqual([])
    }
  }
})

test("long merchant banner text stays inside the storefront at mobile widths", async ({ page, baseURL }) => {
  await signInAs(page, "store_manager", "/admin/content/home")
  const { home } = await (await page.request.get("/api/admin/content/home")).json()
  const headers = staffHeaders(baseURL)
  const saved = await page.request.put("/api/admin/content/home", { headers, data: { content: { ...home.content, heading: ["W".repeat(30), "Your", "Next", "Pair"], description: "W".repeat(600), instagram: { ...home.content.instagram, handle: "W".repeat(80) }, categories: home.content.categories.map((category: { title: string[] }) => ({ ...category, title: ["W".repeat(40), "Pairs"] })) }, expectedUpdatedAt: home.updatedAt } })
  expect(saved.status()).toBe(200)
  const changed = await saved.json()
  try {
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto("/")
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `merchant text at ${width}`).toBe(width)
      for (const card of await page.locator("section[aria-labelledby='categories-title'] li > a").all()) {
        const box = (await card.boundingBox())!
        const heading = (await card.locator("h3").boundingBox())!
        const action = (await card.getByText("Explore", { exact: true }).boundingBox())!
        expect(heading.y + heading.height).toBeLessThanOrEqual(box.y + box.height)
        expect(action.y + action.height).toBeLessThanOrEqual(box.y + box.height)
      }
    }
  } finally {
    expect((await page.request.put("/api/admin/content/home", { headers, data: { content: home.content, expectedUpdatedAt: changed.updatedAt } })).status()).toBe(200)
  }
})
