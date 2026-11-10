import { expect, type Page } from "@playwright/test"

/** Header panel states the audits open (qa/screens.map.json "derived" entries). */
export const PANELS = ["closed", "mega-open", "search-open", "search-typing", "account-open", "cart-open", "drawer-open"] as const
export type PanelState = (typeof PANELS)[number]

const DESKTOP = 1024

/** Whether a panel exists at this width: mega menus from lg, the drawer below it. */
export function panelApplies(state: PanelState, width: number): boolean {
  if (state === "mega-open") return width >= DESKTOP
  if (state === "drawer-open") return width < DESKTOP
  return true
}

/** Wait for React to attach the shared header before acting or measuring a settled page. */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const header = document.querySelector("header")
    return !!header && Object.keys(header).some((key) => key.startsWith("__reactFiber"))
  })
}

/** Opens a header panel the way a shopper would and waits until it has settled. */
export async function openPanel(page: Page, state: PanelState): Promise<void> {
  if (state === "closed") return
  await waitForHydration(page)
  const header = page.locator("header").first()
  switch (state) {
    case "mega-open": {
      const trigger = header.getByRole("button", { name: "Men", exact: true })
      await trigger.focus()
      await page.keyboard.press("ArrowDown")
      await expect(page.locator(`#${await trigger.getAttribute("aria-controls")}`)).toBeVisible()
      break
    }
    case "search-open":
    case "search-typing": {
      await header.getByRole("button", { name: "Search" }).click()
      const input = page.getByRole("combobox", { name: "Search shoes, brands and styles" })
      await expect(input).toBeFocused()
      if (state === "search-typing") {
        await input.fill("nike")
        await expect(page.getByRole("option").first()).toBeVisible()
        await expect(page.getByRole("listbox")).not.toHaveAttribute("aria-busy", "true")
      } else {
        await expect(page.getByRole("listbox", { name: "Search suggestions" })).toBeVisible()
      }
      break
    }
    case "account-open":
      await header.getByRole("button", { name: /^Account/ }).click()
      await expect(page.getByRole("dialog", { name: /^(Your account|Hi, )/ })).toBeVisible()
      break
    case "cart-open":
      await header.getByRole("button", { name: /^Bag/ }).click()
      await expect(page.getByRole("dialog", { name: /bag/i })).toBeVisible()
      break
    case "drawer-open":
      await header.getByRole("button", { name: "Open menu" }).click()
      await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible()
      break
  }
  await page.waitForTimeout(250)
}
