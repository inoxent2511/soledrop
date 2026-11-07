import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const jar = vi.hoisted(() => ({ set: vi.fn(), delete: vi.fn(), get: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: async () => jar, headers: async () => new Headers() }))

describe("actual auth cookie writers and HTTP mutation wrappers", () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks()
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DATA_DRIVER", "fixtures")
    vi.stubEnv("ADMIN_DEMO_STAFF", "off")
    vi.stubEnv("SESSION_SECRET", "production-cookie-test-private-secret-at-least-32-characters")
    vi.stubEnv("JOBS_SECRET", "production-cookie-test-jobs-secret")
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://store.example.test")
    vi.stubEnv("COOKIE_SECURE", undefined)
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

  it("writes distinct HttpOnly/Secure/Lax cookies for customer, staff and cart in production", async () => {
    const { setStaffCookie } = await import("@/server/admin/dal")
    const { setSessionCookie, setCartCookie } = await import("@/server/http/route")
    const expiresAt = new Date(Date.now() + 60_000).toISOString()
    await setStaffCookie("staff-opaque-token", expiresAt)
    await setSessionCookie("customer-opaque-token", expiresAt)
    await setCartCookie("cart-opaque-token")
    expect(jar.set.mock.calls.map((call) => call[0])).toEqual(["sd_staff", "sd_session", "sd_cart"])
    for (const call of jar.set.mock.calls) expect(call[2]).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" })
    expect(jar.set.mock.calls[0][2].expires.toISOString()).toBe(expiresAt)
  })

  it("scopes short-lived browser proofs to auth endpoints and expires them with the same scope", async () => {
    const { setAuthBrowserCookie, clearAuthBrowserCookie, OIDC_BROWSER_COOKIE, MAGIC_BROWSER_COOKIE } = await import("@/server/http/auth-browser")
    await setAuthBrowserCookie(OIDC_BROWSER_COOKIE, "oidc-browser-proof")
    await setAuthBrowserCookie(MAGIC_BROWSER_COOKIE, "magic-browser-proof")
    await clearAuthBrowserCookie(OIDC_BROWSER_COOKIE)
    expect(jar.set.mock.calls[0][2]).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/api/auth", maxAge: 300 })
    expect(jar.set.mock.calls[1][2].maxAge).toBe(900)
    expect(jar.set.mock.calls[2]).toEqual(["sd_oidc", "", expect.objectContaining({ path: "/api/auth", maxAge: 0 })])
  })

  it("blocks missing/foreign Origin across every cookie realm and permits the exact configured origin", async () => {
    const { route } = await import("@/server/http/route")
    let changes = 0
    const handler = route(async () => { changes++; return Response.json({ ok: true }) })
    for (const cookie of ["sd_session=x", "sd_staff=x", "sd_cart=x"]) {
      for (const origin of [null, "https://attacker.example.test", "http://store.example.test"]) {
        const headers = new Headers({ cookie }); if (origin) headers.set("origin", origin)
        const result = await handler(new Request("https://store.example.test/api/cart", { method: "POST", headers }), undefined)
        expect(result.status).toBe(403)
      }
      expect((await handler(new Request("https://store.example.test/api/cart", { method: "POST", headers: { cookie, origin: "https://store.example.test" } }), undefined)).status).toBe(200)
    }
    expect(changes).toBe(3)
  })

  it("requires Origin on unauthenticated login and keeps an auth response private", async () => {
    const { route } = await import("@/server/http/route")
    const handler = route(async () => Response.json({ ok: true }))
    expect((await handler(new Request("https://store.example.test/api/auth/login", { method: "POST" }), undefined)).status).toBe(403)
    const result = await handler(new Request("https://store.example.test/api/auth/login", { method: "POST", headers: { origin: "https://store.example.test" } }), undefined)
    expect(result.status).toBe(200)
    expect(result.headers.get("cache-control")).toBe("private, no-store")
  })
})
