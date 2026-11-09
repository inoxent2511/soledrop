import { expect, type APIRequestContext } from "@playwright/test"
import { test } from "./support/test"

import { PRESET_ROLES, type Permission } from "../server/admin/permissions"
import { codeFor, DEMO_PASSWORD, demoEmail, staffHeaders } from "./support/admin"

/**
 * The permission matrix, enforced (admin A11): every preset role signs in for real and calls every
 * admin read API and opens every module page; each answer must match the role's permissions in
 * server/admin/permissions.ts (200 when held, 403 / no-access when not). Chromium only.
 */
test.skip(({ browserName }) => !process.env.QA_STAFF_FILE && browserName !== "chromium", "Shared demo TOTP accounts; isolated QA runs every browser")
test.describe.configure({ mode: "parallel" })

const ENDPOINTS: [string, Permission][] = [
  ["/api/admin/orders", "orders:read"],
  ["/api/admin/orders/export", "orders:export"],
  ["/api/admin/customers", "customers:read"],
  ["/api/admin/products", "products:read"],
  ["/api/admin/products/export", "products:export"],
  ["/api/admin/brands", "products:read"],
  ["/api/admin/collections", "collections:read"],
  ["/api/admin/inventory", "inventory:read"],
  ["/api/admin/media", "media:read"],
  ["/api/admin/promotions", "promotions:read"],
  ["/api/admin/marketing/subscribers", "marketing:read"],
  ["/api/admin/marketing/abandoned", "marketing:read"],
  ["/api/admin/search", "search:read"],
  ["/api/admin/search/synonyms", "search:read"],
  ["/api/admin/content/pages", "content:read"],
  ["/api/admin/content/faqs", "content:read"],
  ["/api/admin/content/home", "content:read"],
  ["/api/admin/payments", "payments:read"],
  ["/api/admin/reports/sales", "reports:read"],
  ["/api/admin/reports/sales/export", "reports:export"],
  ["/api/admin/reports/inventory", "reports:read"],
  ["/api/admin/shipping", "shipping:read"],
  ["/api/admin/staff", "staff:read"],
  ["/api/admin/roles", "staff:read"],
  ["/api/admin/audit", "audit:read"],
]

const PAGES: [string, Permission][] = [
  ["/admin", "dashboard:read"],
  ["/admin/orders", "orders:read"],
  ["/admin/customers", "customers:read"],
  ["/admin/products", "products:read"],
  ["/admin/collections", "collections:read"],
  ["/admin/banners", "content:read"],
  ["/admin/content/home", "content:read"],
  ["/admin/inventory", "inventory:read"],
  ["/admin/media", "media:read"],
  ["/admin/promotions", "promotions:read"],
  ["/admin/marketing", "marketing:read"],
  ["/admin/search", "search:read"],
  ["/admin/content", "content:read"],
  ["/admin/payments", "payments:read"],
  ["/admin/reports", "reports:read"],
  ["/admin/shipping", "shipping:read"],
  ["/admin/settings", "settings:read"],
  ["/admin/staff", "staff:read"],
  ["/admin/audit", "audit:read"],
]

/** Password, then the TOTP step (waiting for the next step if another test just used this one). */
async function apiSignIn(request: APIRequestContext, baseURL: string | undefined, role: string) {
  const headers = staffHeaders(baseURL)
  const login = await request.post("/api/admin/auth/login", { headers, data: { email: demoEmail(role), password: DEMO_PASSWORD } })
  expect(login.status(), `${role} password`).toBe(200)
  for (let attempt = 0; attempt < 3; attempt++) {
    const verify = await request.post("/api/admin/auth/mfa/verify", { headers, data: { code: codeFor(role) } })
    if (verify.ok()) return
    await new Promise((resolve) => setTimeout(resolve, 30_000 - (Date.now() % 30_000) + 500))
  }
  throw new Error(`${role} could not finish two-step verification`)
}

for (const role of PRESET_ROLES) {
  test(`${role.name}: every API and page answers as the matrix says`, async ({ page, baseURL }) => {
    test.setTimeout(150_000)
    await apiSignIn(page.request, baseURL, role.key)
    const holds = new Set<string>(role.permissions)
    const mismatches: string[] = []
    for (const [path, permission] of ENDPOINTS) {
      const status = (await page.request.get(path)).status()
      const expected = holds.has(permission) ? 200 : 403
      if (status !== expected) mismatches.push(`${path}: ${status}, expected ${expected} (${permission})`)
    }
    for (const [path, permission] of PAGES) {
      const response = await page.goto(path)
      const deniedTo = page.url().includes("/admin/no-access")
      const allowed = holds.has(permission)
      if (allowed && (deniedTo || response?.status() !== 200)) mismatches.push(`${path}: refused but ${permission} is held`)
      if (!allowed && !deniedTo) mismatches.push(`${path}: opened without ${permission}`)
    }
    expect(mismatches).toEqual([])
  })
}
