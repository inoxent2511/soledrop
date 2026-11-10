import { expect } from "@playwright/test"
import { test } from "./support/test"

test.use({ viewport: { width: 390, height: 844 } })

for (const formCase of [
  { title: "order lookup", route: "/orders/lookup", marker: "Find my order", button: "Find my order", endpoint: "/api/orders/lookup", status: 404 },
  { title: "customer sign-in", route: "/account/login", marker: "Forgot your password?", button: "Sign in", endpoint: "/api/auth/login", status: 401 },
]) test(`${formCase.title} retains entered details and waits for its submission handler`, async ({ page }, testInfo) => {
  const email = `hydration-${testInfo.project.name}-${Date.now()}@example.test`
  const fields = formCase.route === "/orders/lookup"
    ? [{ label: "Order number", value: "SD99999" }, { label: "Email used at checkout", value: email }]
    : [{ label: "Email", value: email }, { label: "Password", value: "wrongPassword1" }]
  const html = await (await page.request.get(formCase.route)).text()
  const scripts = [...new Set([...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]))]
  let chunk: string | undefined
  for (const script of scripts) {
    if (!script.includes("/_next/static/chunks/")) continue
    if ((await (await page.request.get(script)).text()).includes(formCase.marker)) { chunk = new URL(script, "http://localhost").pathname; break }
  }
  expect(chunk, "the production page references its form client code").toBeTruthy()
  await page.addInitScript(() => {
    const state = window as typeof window & { formProbe?: { block: boolean; attempts: string[][] } }
    state.formProbe = { block: true, attempts: [] }
    document.addEventListener("submit", event => {
      if (!(event.target instanceof HTMLFormElement) || !state.formProbe!.block) return
      state.formProbe!.attempts.push([...new FormData(event.target).keys()])
      // Observe unsafe native submission without putting even test contact details in a URL.
      event.preventDefault()
    }, true)
  })
  let release!: () => void, held = 0
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route(url => url.pathname === chunk, async route => { held++; await pending; await route.continue() })
  try {
    await page.goto(formCase.route, { waitUntil: "domcontentloaded" })
    await expect.poll(() => held).toBeGreaterThan(0)
    for (const field of fields) await page.getByLabel(field.label, { exact: true }).fill(field.value)
    const submit = page.getByRole("button", { name: formCase.button, exact: true })
    await submit.scrollIntoViewIfNeeded()
    const box = await submit.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    expect(await page.evaluate(() => (window as typeof window & { formProbe?: { attempts: string[][] } }).formProbe!.attempts)).toEqual([])
    release()
    await expect(submit).toBeEnabled()
    for (const field of fields) await expect(page.getByLabel(field.label, { exact: true })).toHaveValue(field.value)
    await page.evaluate(() => { (window as typeof window & { formProbe?: { block: boolean } }).formProbe!.block = false })
    const response = page.waitForResponse(result => result.request().method() === "POST" && new URL(result.url()).pathname === formCase.endpoint)
    await submit.click()
    expect((await response).status()).toBe(formCase.status)
    await expect(page.getByRole("alert").filter({ hasText: /./ })).toBeVisible()
    expect(new URL(page.url()).pathname).toBe(formCase.route)
    expect(new URL(page.url()).search).toBe("")
  } finally { release(); await page.unrouteAll({ behavior: "wait" }) }
})
