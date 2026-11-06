import { expect, test, type Page } from "@playwright/test"

import { waitForHydration } from "./support/panels"

// Size Guide (D-058): Brand New / Pre-Loved tabs, each with its own men's and women's chart.

async function ready(page: Page, route = "/size-guide") {
  await page.goto(route, { waitUntil: "load" })
  await waitForHydration(page)
}

test.describe("size guide", () => {
  test("Brand New shows men's and women's EU/US/UK/CM charts first", async ({
    page,
  }) => {
    await ready(page)
    const tabs = page
      .getByRole("tablist", { name: "Size guide" })
      .getByRole("tab")
    await expect(tabs).toHaveText(["Brand New", "Pre-Loved"])
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true")
    const panel = page.getByRole("tabpanel", { name: "Brand New" })
    await expect(panel.getByRole("table")).toHaveCount(2)
    const men = panel.getByRole("table", { name: /Brand New men's/ })
    await expect(men.getByRole("columnheader")).toHaveText([
      "EU",
      "US",
      "UK",
      "CM",
    ])
    await expect(men.getByRole("row", { name: /^42 / })).toContainText(
      ["8.5", "7.5", "26.5"].join("")
    )
  })

  test("Pre-Loved switches in place, keeps the choice in the URL and opens from a link", async ({
    page,
  }) => {
    await ready(page)
    await page.getByRole("tab", { name: "Pre-Loved" }).click()
    await expect(page).toHaveURL(/#pre-loved$/)
    const panel = page.getByRole("tabpanel", { name: "Pre-Loved" })
    await expect(panel.getByRole("table")).toHaveCount(2)
    await expect(
      panel
        .getByRole("table", { name: /Pre-Loved men's/ })
        .getByRole("columnheader")
    ).toHaveText(["EU", "UK / PAK", "US"])
    await expect(
      panel.getByRole("table", { name: /Pre-Loved women's/ }).getByRole("row")
    ).toHaveCount(18)

    await ready(page, "/size-guide#pre-loved")
    await expect(page.getByRole("tab", { name: "Pre-Loved" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })
})
