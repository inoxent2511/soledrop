import { expect } from "@playwright/test"
import { test } from "./support/test"

test.use({ viewport: { width: 390, height: 844 } })

for (const panel of [
  { name: "Search", fallback: "link" as const, dialog: /^Search$/, keyboard: true, hover: false },
  { name: "Account", fallback: "link" as const, dialog: /^Your account$/, keyboard: false, hover: false },
  { name: "Account", fallback: "link" as const, dialog: /^Your account$/, keyboard: false, hover: true },
  { name: "Bag, empty", fallback: "link" as const, dialog: /bag/i, keyboard: false, hover: false },
  { name: "Open menu", fallback: "button" as const, dialog: /^Menu$/, keyboard: false, hover: false },
]) test(`the first ${panel.name} ${panel.hover ? "hover" : "action"} survives slow panel code`, async ({ page }) => {
  // Model a busy page whose idle task has not run; actual user intent must still work.
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 1
    window.cancelIdleCallback = () => {}
  })
  await page.goto("/", { waitUntil: "networkidle" })
  const trigger = page.locator("header").getByRole(panel.fallback, { name: panel.name, exact: true })
  await expect(trigger).toBeVisible()
  let release!: () => void, held = 0
  const pending = new Promise<void>((resolve) => { release = resolve })
  await page.route("**/_next/static/chunks/*.js", async (route) => { held++; await pending; await route.continue() })
  try {
    if (panel.hover) await trigger.hover()
    else if (panel.keyboard) { await trigger.focus(); await page.keyboard.press("Enter") }
    else await trigger.click()
    await expect.poll(() => held).toBeGreaterThan(0)
    expect(new URL(page.url()).pathname).toBe("/")
    await expect(page.getByRole("dialog", { name: panel.dialog })).toHaveCount(0)
    release()
    const dialog = page.getByRole("dialog", { name: panel.dialog })
    await expect(dialog).toBeVisible()
    if (panel.name === "Search") await expect(page.getByRole("combobox", { name: "Search shoes, brands and styles" })).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    if (!panel.hover) await expect(page.locator("header").getByRole("button", { name: panel.name, exact: true })).toBeFocused()
  } finally { release(); await page.unrouteAll({ behavior: "wait" }) }
})
