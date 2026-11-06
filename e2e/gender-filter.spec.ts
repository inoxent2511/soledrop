import { expect, test, type Page } from "@playwright/test"

// D-067: a Men or Women tab's Brand New and Pre-Loved choices open with that gender ticked; no Kids filter.

const filters = (page: Page) => page.getByRole("region", { name: "Filters" })
const genderBox = (page: Page, name: string) =>
  filters(page).getByRole("checkbox", { name, exact: true })

test.describe("gender filter from the header", () => {
  for (const [tab, gender, other] of [
    ["Men", "men", "Women"],
    ["Women", "women", "Men"],
  ] as const) {
    for (const [choice, path] of [
      ["Brand New", `/collections/${gender}?kind=new&gender=${gender}`],
      ["Pre-Loved", `/pre-loved?gender=${gender}`],
    ] as const) {
      test(`${tab} › ${choice} opens with ${tab} ticked`, async ({ page }) => {
        await page.goto(path)
        await expect(genderBox(page, tab)).toBeChecked()
        await expect(genderBox(page, other)).not.toBeChecked()
        await expect(
          filters(page).getByRole("button", { name: "Clear All" })
        ).toBeVisible()
        await expect(
          page.locator("main").getByText("No pairs found")
        ).toHaveCount(0)
      })
    }
  }

  test("the header links carry the gender", async ({ page }) => {
    await page.goto("/")
    const hrefs = await page
      .locator("header a[href]")
      .evaluateAll((anchors) =>
        anchors.map((anchor) => anchor.getAttribute("href"))
      )
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/collections/men?kind=new&gender=men",
        "/pre-loved?gender=men",
        "/collections/women?kind=new&gender=women",
        "/pre-loved?gender=women",
      ])
    )
  })
})

test.describe("no Kids filter", () => {
  for (const route of [
    "/collections/men",
    "/collections/brand-new",
    "/pre-loved",
    "/collections/women",
    "/search?q=nike",
  ]) {
    test(`${route} offers only Men and Women`, async ({ page }) => {
      await page.goto(route)
      await expect(genderBox(page, "Kids")).toHaveCount(0)
      await expect(genderBox(page, "Men")).toHaveCount(1)
      await expect(genderBox(page, "Women")).toHaveCount(1)
    })
  }

  test("an old ?gender=kids link is ignored, not shown as an active filter", async ({
    page,
  }) => {
    await page.goto("/pre-loved?gender=kids")
    await expect(
      filters(page).getByRole("button", { name: "Clear All" })
    ).toHaveCount(0)
    await expect(page.locator("main").getByText("No pairs found")).toHaveCount(
      0
    )
  })
})
