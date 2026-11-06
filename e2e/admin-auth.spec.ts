import { expect, test } from "@playwright/test"

import { clientAddress, codeFor, DEMO_PASSWORD, demoEmail, signInAs, staffHeaders } from "./support/admin"

/**
 * Admin foundation (A1) against the production build: the three layers turn away anonymous
 * visitors, customers and password-only sessions; staff sign in with a second factor; the admin
 * is served with its own nonce CSP and never cached; the sidebar follows the member's permissions.
 */
const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`

test.describe("without a staff session", () => {
  test("anonymous visitors are sent to sign in, and admin APIs answer 401", async ({ page, request }) => {
    await page.goto("/admin/orders?status=paid")
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Forders%3Fstatus%3Dpaid$/)
    await expect(page.getByRole("heading", { name: "Staff sign in" })).toBeVisible()
    for (const path of ["/api/admin/me", "/api/admin/account/sessions"]) expect((await request.get(path)).status(), path).toBe(401)
  })

  test("a signed-in customer is not staff", async ({ page, baseURL }) => {
    const email = `shopper-${unique()}@example.test`
    const registered = await page.request.post("/api/auth/register", { headers: staffHeaders(baseURL), data: { fullName: "Shopper Test", email, password: "shopper-pass-1234", marketingOptIn: false } })
    expect(registered.ok()).toBe(true)
    expect((await page.request.get("/api/admin/me")).status()).toBe(401)
    await page.goto("/admin")
    await expect(page).toHaveURL(/\/admin\/login/)
    // The shopper's password is not a staff password either.
    const login = await page.request.post("/api/admin/auth/login", { headers: staffHeaders(baseURL), data: { email, password: "shopper-pass-1234" } })
    expect(login.status()).toBe(401)
  })

  test("a password-only (AAL1) session reaches only two-step verification", async ({ page, baseURL }) => {
    const login = await page.request.post("/api/admin/auth/login", { headers: staffHeaders(baseURL), data: { email: demoEmail("read_only"), password: DEMO_PASSWORD } })
    expect(await login.json()).toEqual({ needs: "verify" })
    const me = await page.request.get("/api/admin/me")
    expect(me.status()).toBe(401)
    expect((await me.json()).error.details).toEqual({ mfa: true })
    await page.goto("/admin")
    await expect(page).toHaveURL(/\/admin\/mfa$/)
    await page.goto("/admin/account")
    await expect(page).toHaveURL(/\/admin\/mfa$/)
  })

  test("sign-in errors don't reveal whether an account exists, and cross-site posts are refused", async ({ request, baseURL }) => {
    const headers = staffHeaders(baseURL)
    const unknown = await request.post("/api/admin/auth/login", { headers, data: { email: `nobody-${unique()}@example.test`, password: "whatever-password" } })
    const wrong = await request.post("/api/admin/auth/login", { headers, data: { email: demoEmail("marketing"), password: "not-the-password" } })
    expect(unknown.status()).toBe(401)
    expect(wrong.status()).toBe(401)
    expect((await unknown.json()).error.message).toBe((await wrong.json()).error.message)

    const crossSite = await request.post("/api/admin/auth/login", { headers: { origin: "https://attacker.example", "x-forwarded-for": clientAddress() }, data: { email: demoEmail("owner"), password: DEMO_PASSWORD } })
    expect(crossSite.status()).toBe(403)
    const noOrigin = await request.post("/api/admin/auth/login", { data: { email: demoEmail("owner"), password: DEMO_PASSWORD } })
    expect(noOrigin.status()).toBe(403)
  })

  test("admin pages carry a per-request nonce CSP, no-store and noindex", async ({ request }) => {
    const first = await request.get("/admin/login")
    const second = await request.get("/admin/login")
    const csp = first.headers()["content-security-policy"]
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/)
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/)
    expect(csp).not.toBe(second.headers()["content-security-policy"])
    expect(first.headers()["cache-control"]).toContain("no-store")
    expect(first.headers()["x-robots-tag"]).toBe("noindex, nofollow")
    // The storefront keeps its own static policy.
    expect((await request.get("/faq")).headers()["content-security-policy"]).toContain("script-src 'self' 'unsafe-inline'")
  })
})

test.describe("with a staff session", () => {
  test("the Owner signs in with a second factor and sees every module, without CSP violations", async ({ page, browserName }) => {
    // One demo account per browser, so parallel projects don't race for the same TOTP step.
    const role = { chromium: "owner", firefox: "admin", webkit: "store_manager" }[browserName] ?? "owner"
    const violations: string[] = []
    page.on("console", (message) => {
      if (message.type() === "error" && /Content Security Policy|Content-Security-Policy|CSP/i.test(message.text())) violations.push(message.text())
    })
    await signInAs(page, role)
    await expect(page.getByRole("heading", { name: /^Hello, DEMO/ })).toBeVisible()
    const nav = page.getByRole("navigation", { name: "Admin" }).first()
    await expect(nav.getByRole("link", { name: "Orders" })).toBeVisible()
    await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page")
    if (role !== "store_manager") await expect(nav.getByRole("link", { name: "Staff & roles" })).toBeVisible()
    expect(violations).toEqual([])
  })

  test("a Support Agent sees only their modules, and a refused permission explains itself", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "one TOTP-limited account; permissions don't vary by engine")
    await signInAs(page, "support_agent")
    const nav = page.getByRole("navigation", { name: "Admin" }).first()
    await expect(nav.getByRole("link", { name: "Orders" })).toBeVisible()
    await expect(nav.getByRole("link", { name: "Customers" })).toBeVisible()
    for (const hidden of ["Staff & roles", "Settings", "Audit log", "Payments", "Promotions"]) await expect(nav.getByRole("link", { name: hidden })).toHaveCount(0)
    await page.goto("/admin/no-access?need=staff:read")
    await expect(page.getByText("Staff & roles needs the See staff and roles permission")).toBeVisible()
    expect((await page.request.get("/api/admin/me")).ok()).toBe(true)
    const me = await (await page.request.get("/api/admin/me")).json()
    expect(me.permissions).not.toContain("staff:read")
    expect(me.refundLimit).toBe(500_000)
  })

  test("signing out ends the session for good", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "one TOTP-limited account")
    await signInAs(page, "fulfilment")
    const cookies = await page.context().cookies()
    const staffCookie = cookies.find((cookie) => cookie.name === "sd_staff")
    expect(staffCookie).toMatchObject({ httpOnly: true, sameSite: "Strict" })
    await page.getByRole("button", { name: "Sign out" }).click()
    await expect(page).toHaveURL(/\/admin\/login/)
    // Replaying the old cookie gets nothing.
    await page.context().addCookies([{ ...staffCookie!, sameSite: "Strict" }])
    expect((await page.request.get("/api/admin/me")).status()).toBe(401)
  })

  test("a refused code doesn't sign anyone in", async ({ page, baseURL, browserName }) => {
    test.skip(browserName !== "chromium", "one TOTP-limited account")
    await page.request.post("/api/admin/auth/login", { headers: staffHeaders(baseURL), data: { email: demoEmail("content_editor"), password: DEMO_PASSWORD } })
    const wrong = String((Number(codeFor("content_editor")) + 500_000) % 1_000_000).padStart(6, "0")
    const verify = await page.request.post("/api/admin/auth/mfa/verify", { headers: staffHeaders(baseURL), data: { code: wrong } })
    expect(verify.status()).toBe(422)
    expect((await page.request.get("/api/admin/me")).status()).toBe(401)
  })
})
