import { expect, test } from "@playwright/test"

// FAQs (D-066): the owner's 18 questions in five topics, with live contact details and delivery rate.

const TOPICS: [string, number][] = [
  ["Shopping & sizing", 5],
  ["Pre-Loved shoes", 5],
  ["Delivery & tracking", 3],
  ["Returns, exchanges & refunds", 4],
  ["Contact us", 1],
]

test.describe("FAQs", () => {
  test("lists every question under its topic, with nothing left to fill in", async ({
    page,
  }) => {
    await page.goto("/faq")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/faqs/i)
    const index = page.getByRole("navigation", { name: "FAQ topics" })
    await expect(index).toContainText("18 questions · 5 topics")
    for (const [topic, count] of TOPICS) {
      const section = page.getByRole("region", { name: topic })
      await expect(section.locator("details")).toHaveCount(count)
      await expect(
        index.getByRole("link", {
          name: new RegExp(`^\\d*\\s*${topic.replace(/[&]/g, "\\&")}`),
        })
      ).toBeVisible()
    }
    const main = await page.locator("main").innerText()
    expect(main).not.toMatch(/\{[a-zA-Z]+\}|\[[A-Z ]+\]/)
  })

  test("answers open in place and show live details", async ({ page }) => {
    await page.goto("/faq")
    const delivery = page.locator("details", {
      hasText: "How much is delivery?",
    })
    await delivery.locator("summary").click()
    await expect(delivery).toContainText(
      /Standard shipping: Rs\. 250 per order, free on orders above Rs\. 12,000\./
    )
    const contact = page.locator("details", {
      hasText: "How do I contact Soledrop?",
    })
    await contact.locator("summary").click()
    await expect(contact.getByRole("link", { name: /@/ })).toHaveAttribute(
      "href",
      /^mailto:/
    )
    await expect(
      contact.getByRole("link", { name: /\/contact$/ })
    ).toHaveAttribute("href", "/contact")
  })
})

test.describe("FAQs without JavaScript", () => {
  test.use({ javaScriptEnabled: false })

  test("questions are native disclosures", async ({ page }) => {
    await page.goto("/faq")
    const first = page.locator("details").first()
    await first.locator("summary").click()
    await expect(first).toHaveAttribute("open", "")
  })
})
