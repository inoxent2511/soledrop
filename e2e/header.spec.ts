import { expect, type Page } from "@playwright/test"
import { test } from "./support/test"

import { waitForHydration } from "./support/panels"

/**
 * Header interaction checklist (E3): nav dropdowns, search overlay, account popover, mini-cart and
 * mobile drawer — open/close paths, keyboard, focus return, hover intent, states, and the
 * no-JavaScript fallbacks. Desktop 1440 unless a test sets a phone viewport.
 */

const header = (page: Page) => page.locator("header").first()

async function ready(page: Page, route = "/") {
  await page.goto(route, { waitUntil: "load" })
  await waitForHydration(page)
}

test.describe("nav dropdown", () => {
  test("opens on hover after the intent delay and closes after leaving", async ({ page }) => {
    await ready(page)
    const trigger = header(page).getByRole("button", { name: "Men", exact: true })
    const panel = page.locator(`#${await trigger.getAttribute("aria-controls")}`)
    await trigger.hover()
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    await expect(panel).toBeVisible()
    await page.mouse.move(700, 880)
    await expect(panel).toBeHidden()
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
  })

  test("a quick pass over the nav does not open a panel", async ({ page }) => {
    await ready(page)
    const trigger = header(page).getByRole("button", { name: "Women", exact: true })
    const box = (await trigger.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.move(box.x + box.width / 2, box.y + 400)
    await page.waitForTimeout(300)
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
  })

  test("is keyboard operable: ArrowDown enters, arrows move, Escape returns focus", async ({ page }) => {
    await ready(page)
    const men = header(page).getByRole("button", { name: "Men", exact: true })
    await men.focus()
    await page.keyboard.press("ArrowDown")
    const panel = page.locator(`#${await men.getAttribute("aria-controls")}`)
    await expect(panel).toBeVisible()
    const links = panel.getByRole("link")
    await expect(links.first()).toBeFocused()
    await page.keyboard.press("ArrowDown")
    await expect(links.nth(1)).toBeFocused()
    await page.keyboard.press("End")
    await expect(links.last()).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(panel).toBeHidden()
    await expect(men).toBeFocused()
    await page.keyboard.press("ArrowRight")
    await expect(header(page).getByRole("button", { name: "Women", exact: true })).toBeFocused()
  })

  // Regression BUG-007: hovering another item while focus is inside the open panel switched it closed.
  test("keeps one panel open at a time and closes on outside click and navigation", async ({ page }) => {
    await ready(page)
    const men = header(page).getByRole("button", { name: "Men", exact: true })
    const women = header(page).getByRole("button", { name: "Women", exact: true })
    await men.focus()
    await page.keyboard.press("Space")
    await women.hover()
    await expect(women).toHaveAttribute("aria-expanded", "true")
    await expect(men).toHaveAttribute("aria-expanded", "false")
    await page.mouse.click(700, 880)
    await expect(women).toHaveAttribute("aria-expanded", "false")
    await women.focus()
    await page.keyboard.press("ArrowDown")
    await page.locator(`#${await women.getAttribute("aria-controls")}`).getByRole("link", { name: "Brand New" }).click()
    await expect(page).toHaveURL(/\/collections\/women\?kind=new&gender=women$/)
    await expect(page.locator("[id^=nav-panel-]:visible")).toHaveCount(0)
    // D-067: the tab's gender arrives already ticked in the Gender filter.
    await expect(page.getByRole("region", { name: "Filters" }).getByRole("checkbox", { name: "Women", exact: true })).toBeChecked()
  })

  // D-045: every dropdown tab offers the same two choices and nothing else, and neither leads to an empty listing.
  test("every tab's dropdown offers exactly Brand New and Pre-Loved for that tab", async ({ page, request }) => {
    await ready(page)
    for (const [label, brandNew, preLoved] of [
      ["Men", "/collections/men?kind=new&gender=men", "/pre-loved?gender=men"],
      ["Women", "/collections/women?kind=new&gender=women", "/pre-loved?gender=women"],
    ]) {
      const trigger = header(page).getByRole("button", { name: label, exact: true })
      await trigger.focus()
      await page.keyboard.press("ArrowDown")
      const panel = page.locator(`#${await trigger.getAttribute("aria-controls")}`)
      await expect(panel).toBeVisible()
      await expect(panel.getByRole("link")).toHaveText(["Brand New", "Pre-Loved"])
      await expect(panel.getByRole("link", { name: "Brand New" })).toHaveAttribute("href", brandNew)
      await expect(panel.getByRole("link", { name: "Pre-Loved" })).toHaveAttribute("href", preLoved)
      await page.keyboard.press("Escape")
      await expect(panel).toBeHidden()
      for (const href of [brandNew, preLoved]) {
        const html = await (await request.get(href)).text()
        expect(html, href).not.toContain("No pairs found")
      }
    }
  })

  // D-045: Brand New / Pre-Loved are pages of their own, never a filter the shopper can untick.
  test("a Brand New page offers no type filter and keeps its scope through filters and Clear All", async ({ page }) => {
    await ready(page, "/collections/brand-new?kind=new")
    const filters = page.getByRole("region", { name: "Filters" })
    await expect(filters.getByRole("heading", { name: "Gender" })).toBeVisible()
    await expect(filters.getByText("Type", { exact: true })).toHaveCount(0)
    await expect(filters.getByRole("checkbox", { name: /Brand New|Pre-Loved/ })).toHaveCount(0)
    await expect(filters.getByRole("button", { name: "Clear All" })).toHaveCount(0)
    await filters.getByRole("checkbox", { name: "Men", exact: true }).click()
    await expect(page).toHaveURL(/\/collections\/brand-new\?kind=new&gender=men$/)
    await filters.getByRole("button", { name: "Clear All" }).click()
    await expect(page).toHaveURL(/\/collections\/brand-new\?kind=new$/)
  })

  // Regression BUG-005: z-nav generated no CSS, so the page painted over the open panel.
  test("the open dropdown sits above the page, under its tab", async ({ page }) => {
    await ready(page)
    const men = header(page).getByRole("button", { name: "Men", exact: true })
    await men.focus()
    await page.keyboard.press("ArrowDown")
    const panel = page.locator(`#${await men.getAttribute("aria-controls")}`)
    const card = (await panel.getByRole("list").boundingBox())!
    const tab = (await men.boundingBox())!
    expect(card.y).toBeGreaterThan(tab.y + tab.height)
    expect(card.x).toBeLessThan(tab.x)
    for (const link of await panel.getByRole("link").all()) {
      const box = (await link.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(await page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest("[id^=nav-panel-]"), [box.x + box.width / 2, box.y + box.height / 2])).toBe(true)
    }
  })

  // D-049: the dropdown tabs only open their dropdown; a click never leaves the page.
  test("clicking a tab opens its dropdown and never navigates", async ({ page }) => {
    await ready(page)
    for (const label of ["Men", "Women"]) {
      await expect(header(page).getByRole("link", { name: label, exact: true })).toHaveCount(0)
    }
    const women = header(page).getByRole("button", { name: "Women", exact: true })
    await women.click()
    await expect(women).toHaveAttribute("aria-expanded", "true")
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/$/)
    await women.click()
    await expect(women).toHaveAttribute("aria-expanded", "true")
    await expect(page).toHaveURL(/\/$/)
  })

  // D-053: Sale is a page of its own, a plain link with no dropdown, like New Arrival.
  test("Sale is a link that opens its page, with no dropdown", async ({ page }) => {
    await ready(page)
    await expect(header(page).getByRole("button", { name: "Sale", exact: true })).toHaveCount(0)
    const link = header(page).getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Sale", exact: true })
    await expect(link).toHaveAttribute("href", "/sale")
    await link.hover()
    await page.waitForTimeout(400)
    await expect(page.locator("[id^=nav-panel-]:visible")).toHaveCount(0)
    await link.click()
    await expect(page).toHaveURL(/\/sale$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/on\s*sale/i)
    await expect(header(page).getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Sale", exact: true })).toHaveAttribute("aria-current", "page")
  })

  // D-052: New Arrival is a page of its own, a plain link with no dropdown.
  test("New Arrival is a link that opens its page, with no dropdown", async ({ page }) => {
    await ready(page)
    await expect(header(page).getByRole("button", { name: "New Arrival", exact: true })).toHaveCount(0)
    const link = header(page).getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "New Arrival", exact: true })
    await expect(link).toHaveAttribute("href", "/new-arrivals")
    await expect(link).not.toHaveAttribute("aria-expanded", /.*/)
    await link.hover()
    await page.waitForTimeout(400)
    await expect(page.locator("[id^=nav-panel-]:visible")).toHaveCount(0)

    // The link joins the Arrow-key roving and closes an open dropdown when focus reaches it.
    const men = header(page).getByRole("button", { name: "Men", exact: true })
    await men.focus()
    await page.keyboard.press("Space")
    await expect(men).toHaveAttribute("aria-expanded", "true")
    await expect(page.locator(`#${await men.getAttribute("aria-controls")}`).getByRole("link").first()).toBeFocused()
    await men.focus()
    await page.keyboard.press("ArrowLeft")
    await expect(link).toBeFocused()
    await expect(page.locator("[id^=nav-panel-]:visible")).toHaveCount(0)
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/new-arrivals$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/new\s*arrivals/i)
    await expect(header(page).getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "New Arrival", exact: true })).toHaveAttribute("aria-current", "page")
  })

})

test.describe("nav dropdown on touch", () => {
  test.use({ hasTouch: true })

  test("a tap toggles the dropdown without navigating", async ({ page }) => {
    await ready(page)
    const men = header(page).getByRole("button", { name: "Men", exact: true })
    await men.tap()
    await expect(men).toHaveAttribute("aria-expanded", "true")
    await men.tap()
    await expect(men).toHaveAttribute("aria-expanded", "false")
    await expect(page).toHaveURL(/\/$/)
  })
})

test.describe("search overlay", () => {
  test("is an APG combobox with suggestions, keyboard selection and Enter to search", async ({ page }) => {
    await ready(page)
    const trigger = header(page).getByRole("button", { name: "Search" })
    await trigger.click()
    const input = page.getByRole("combobox", { name: "Search shoes, brands and styles" })
    await expect(input).toBeFocused()
    await expect(input).toHaveAttribute("aria-autocomplete", "list")
    await expect(page.getByRole("group", { name: "Trending" })).toBeVisible()
    await input.fill("kayano")
    await expect(page.getByRole("group", { name: "Products" })).toBeVisible()
    await expect(page.getByRole("status").filter({ hasText: /result/ })).toHaveText(/\d+ result/)
    await page.keyboard.press("ArrowDown")
    const activeId = await input.getAttribute("aria-activedescendant")
    expect(activeId).toBeTruthy()
    await expect(page.locator(`#${activeId}`)).toHaveAttribute("aria-selected", "true")
    await page.keyboard.press("Escape")
    await expect(input).toBeHidden()
    await expect(trigger).toBeFocused()
    await trigger.click()
    await page.getByRole("combobox").fill("air max")
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/search\?q=air(\+|%20)max$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/air max/i)
  })

  // Regression BUG-006: the global focus ring's box-shadow split the field into three white blocks.
  test("the search field shows one focus ring around the whole field", async ({ page }) => {
    await ready(page)
    await header(page).getByRole("button", { name: "Search" }).click()
    await page.keyboard.type("n")
    const input = page.getByRole("combobox")
    await expect(input).toBeFocused()
    const shadow = await input.evaluate((element) => getComputedStyle(element).boxShadow)
    expect(shadow.replace(/rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(, )?/g, "")).toMatch(/^(none)?$/)
    expect(await page.getByRole("search").evaluate((element) => getComputedStyle(element).outlineWidth)).toBe("3px")
  })

  test("remembers recent searches and clears them", async ({ page }) => {
    await ready(page)
    await header(page).getByRole("button", { name: "Search" }).click()
    await page.getByRole("combobox").fill("bondi")
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/q=bondi/)
    await waitForHydration(page)
    await header(page).getByRole("button", { name: "Search" }).click()
    const recent = page.getByRole("group", { name: "Recent searches" })
    await expect(recent.getByRole("option", { name: "bondi" })).toBeVisible()
    await page.getByRole("button", { name: "Clear recent searches" }).click()
    await expect(recent).toBeHidden()
  })

  test("offers did-you-mean and fallbacks when nothing matches", async ({ page }) => {
    await ready(page)
    await header(page).getByRole("button", { name: "Search" }).click()
    await page.getByRole("combobox").fill("kayanno zzqx")
    await expect(page.getByText("No results for “kayanno zzqx”")).toBeVisible()
    await page.getByRole("button", { name: "kayano zzqx" }).click()
    await expect(page.getByRole("combobox")).toHaveValue("kayano zzqx")
    await expect(page.getByRole("group", { name: "Popular categories" })).toBeVisible()
  })

  test("shows an inline offline message with retry", async ({ page, context }) => {
    await ready(page)
    await header(page).getByRole("button", { name: "Search" }).click()
    await context.setOffline(true)
    await expect(page.getByText("You're offline")).toBeVisible()
    await context.setOffline(false)
    await expect(page.getByText("You're offline")).toBeHidden()
  })

  test("is a full-screen sheet with Cancel on phones", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await ready(page)
    await header(page).getByRole("button", { name: "Search" }).click()
    const dialog = page.getByRole("dialog", { name: "Search" })
    const box = (await dialog.boundingBox())!
    expect(box.width).toBe(390)
    expect(box.height).toBe(800)
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(dialog).toBeHidden()
  })
})

test.describe("account popover", () => {
  test("offers sign in, create account and order tracking when signed out", async ({ page }) => {
    await ready(page)
    const trigger = header(page).getByRole("button", { name: "Account" })
    await trigger.click()
    const popup = page.getByRole("dialog", { name: "Your account" })
    await expect(popup.getByRole("link", { name: "Sign in" })).toBeVisible()
    await expect(popup.getByRole("link", { name: "Create account" })).toBeVisible()
    await expect(popup.getByRole("link", { name: "Track an order" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(popup).toBeHidden()
    await expect(trigger).toBeFocused()
  })
})

test.describe("mini-cart", () => {
  test("shows the empty state, then lines with a working stepper and remove", async ({ page }) => {
    await ready(page)
    const bag = header(page).getByRole("button", { name: /^Bag/ })
    await bag.click()
    const drawer = page.getByRole("dialog", { name: /bag/i })
    await expect(drawer.getByText(/bag is empty/i)).toBeVisible()
    await page.keyboard.press("Escape")

    await ready(page, "/products/nike-air-max")
    // The radio is visually hidden behind its chip; select it the way a keyboard user does, in every engine.
    const size = page.getByRole("radio", { name: /42/ }).first()
    await size.focus()
    await page.keyboard.press("Space")
    await expect(size).toBeChecked()
    await page.getByRole("button", { name: "Add to cart", exact: true }).click()
    await expect(header(page).getByRole("button", { name: "Bag, 1 item" })).toBeVisible()
    await header(page).getByRole("button", { name: /^Bag/ }).click()
    await expect(drawer.getByText("NIKE Air Max")).toBeVisible()
    await drawer.getByRole("button", { name: "Increase quantity" }).click()
    // The modal drawer makes the header inert, so counts are read from the drawer title while it is open.
    await expect(page.getByRole("dialog", { name: "Your bag (2)" })).toBeVisible()
    await expect(drawer.getByRole("progressbar", { name: "Progress to free delivery" })).toBeVisible()
    await drawer.getByRole("button", { name: /^Remove NIKE Air Max/ }).click()
    await expect(drawer.getByText(/bag is empty/i)).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(header(page).getByRole("button", { name: "Bag, empty" })).toBeVisible()
  })
})

test.describe("mobile drawer", () => {
  test.use({ viewport: { width: 390, height: 800 } })

  test("drills into a tab's Brand New / Pre-Loved choice with back and breadcrumb, and closes with Escape", async ({ page }) => {
    await ready(page)
    const open = header(page).getByRole("button", { name: "Open menu" })
    await open.click()
    const drawer = page.getByRole("dialog", { name: "Menu" })
    await drawer.getByRole("button", { name: "Men", exact: true }).click()
    await expect(drawer.getByRole("heading", { name: "Men", exact: true })).toBeFocused()
    await expect(drawer.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Menu/Men")
    const options = drawer.getByRole("navigation", { name: "Mobile" }).getByRole("link")
    await expect(options).toHaveText(["Brand New", "Pre-Loved"])
    await expect(options.last()).toHaveAttribute("href", "/pre-loved?gender=men")
    await drawer.getByRole("button", { name: /^Back/ }).click()
    await expect(drawer.getByRole("button", { name: "Women", exact: true })).toBeVisible()
    // D-052: New Arrival opens its page straight from the drawer root.
    await expect(drawer.getByRole("button", { name: "New Arrival", exact: true })).toHaveCount(0)
    await expect(drawer.getByRole("link", { name: "New Arrival", exact: true })).toHaveAttribute("href", "/new-arrivals")
    // D-053: so does Sale.
    await expect(drawer.getByRole("button", { name: "Sale", exact: true })).toHaveCount(0)
    await expect(drawer.getByRole("link", { name: "Sale", exact: true })).toHaveAttribute("href", "/sale")
    await page.keyboard.press("Escape")
    await expect(drawer).toBeHidden()
    await expect(open).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })

  test("closes on the browser Back button without leaving the page", async ({ page }) => {
    await ready(page, "/faq")
    await header(page).getByRole("button", { name: "Open menu" }).click()
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible()
    await page.goBack()
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden()
    await expect(page).toHaveURL(/\/faq$/)
  })

  test("follows a link and closes", async ({ page }) => {
    await ready(page)
    await header(page).getByRole("button", { name: "Open menu" }).click()
    await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "FAQ" }).click()
    await expect(page).toHaveURL(/\/faq$/)
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden()
  })
})

// Regression BUG-003: a single-key "d" shortcut toggled the theme (WCAG 2.1.4).
test("typing outside a field never changes the theme", async ({ page }) => {
  await ready(page)
  const before = await page.evaluate(() => document.documentElement.className)
  await page.locator("body").press("d")
  await page.keyboard.press("D")
  expect(await page.evaluate(() => document.documentElement.className)).toBe(before)
})

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false })

  // Regression BUG-008 (/search stuck on its streaming fallback) and BUG-004 (brand-only search showed nothing).
  test("header controls are links and /search works with a GET form", async ({ page }) => {
    await page.goto("/")
    const links = await header(page).locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href")))
    expect(links).toEqual(expect.arrayContaining(["/search", "/account", "/cart", "/collections/men?kind=new&gender=men", "/pre-loved?gender=men"]))
    // D-049: without JavaScript a tab's dropdown shows while the tab is hovered or focused.
    const men = header(page).getByRole("button", { name: "Men", exact: true })
    const panel = page.locator(`#${await men.getAttribute("aria-controls")}`)
    await expect(panel).toBeHidden()
    await men.hover()
    await expect(panel.getByRole("link", { name: "Brand New" })).toBeVisible()
    await page.goto("/search?q=kayano")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/kayano/i)
    await expect(page.getByRole("status").first()).toHaveText(/pairs? found/)
    await page.goto("/search?brand=nike")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/nike/i)
    await expect(page.getByRole("status").first()).toHaveText(/pairs? found/)
    expect(await page.locator('meta[name="robots"]').getAttribute("content")).toMatch(/noindex/)
  })
})
