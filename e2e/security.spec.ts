import { expect } from "@playwright/test"
import { test } from "./support/test"
import { clientAddress } from "./support/admin"

/**
 * Security sweep (E1) against the production build: private and operator endpoints refuse
 * anonymous callers, cross-site mutations are blocked, and rate limits can't be dodged by writing
 * a fake address into X-Forwarded-For (BUG-015). The harness plays the one trusted proxy
 * (TRUSTED_PROXY_HOPS=1), so the last X-Forwarded-For entry is the shopper's address.
 */
const shopperAddress = clientAddress
const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`

test("document policies protect HTML and workers without repeating them on script/style transfers", async ({ request }) => {
  const home = await request.get("/")
  expect(home.status()).toBe(200)
  expect(home.headers()["content-security-policy"]).toContain("frame-ancestors 'none'")
  expect(home.headers()["x-frame-options"]).toBe("DENY")
  expect(home.headers()["cross-origin-opener-policy"]).toBe("same-origin")
  const script = (await home.text()).match(/src="([^\"]*\/_next\/static\/chunks\/[^\"]+\.js)"/)?.[1]
  expect(script).toBeTruthy()
  for (const destination of ["script", "style", "worker", "document", ""] as const) {
    const response = await request.get(script!, { headers: { "sec-fetch-dest": destination } })
    expect(response.status()).toBe(200)
    const headers = response.headers()
    expect(headers["x-content-type-options"]).toBe("nosniff")
    expect(headers["strict-transport-security"]).toContain("max-age=")
    expect(headers.vary.toLowerCase()).toContain("sec-fetch-dest")
    if (destination === "script" || destination === "style") {
      expect(headers["content-security-policy"]).toBeUndefined()
      expect(headers["x-frame-options"]).toBeUndefined()
    } else {
      expect(headers["content-security-policy"]).toContain("object-src 'none'")
      expect(headers["x-frame-options"]).toBe("DENY")
      expect(headers["permissions-policy"]).toContain("camera=()")
    }
  }
})

test("anonymous callers get 401 from account, operator and job endpoints", async ({ request }) => {
  // The header reads /api/account on every page, so a guest gets an empty answer rather than an error.
  expect(await (await request.get("/api/account")).json()).toEqual({ customer: null, orders: [], addresses: [] })
  expect((await request.patch("/api/account", { data: { fullName: "Mallory" } })).status()).toBe(401)
  expect((await request.delete("/api/account", { data: { password: "wrongPassword1" } })).status()).toBe(401)
  for (const path of ["/api/account/addresses", "/api/account/export", "/api/v1/orders/SD10001", "/api/v1/products/export"]) {
    expect((await request.get(path)).status(), path).toBe(401)
  }
  for (const path of ["/api/jobs/outbox", "/api/jobs/release-reservations", "/api/jobs/purge-carts"]) {
    expect((await request.post(path)).status(), path).toBe(401)
  }
  expect((await request.post("/api/jobs/outbox", { headers: { authorization: "Bearer wrong-secret" } })).status()).toBe(401)
})

test("cross-site mutations are refused before they run", async ({ request }) => {
  const response = await request.post("/api/auth/login", {
    headers: { origin: "https://attacker.example" },
    data: { email: `x-${unique()}@example.test`, password: "wrongPassword1" },
  })
  expect(response.status()).toBe(403)
  expect((await response.json()).error.code).toBe("forbidden")
})

test("sign-in attempts are limited per address and a forged X-Forwarded-For entry doesn't reset the count (BUG-015)", async ({ request, baseURL }) => {
  const address = shopperAddress()
  const attempt = (forged: string) =>
    request.post("/api/auth/login", {
      headers: { origin: new URL(baseURL!).origin, "x-forwarded-for": `${forged}, ${address}` },
      data: { email: `nobody-${unique()}@example.test`, password: "wrongPassword1" },
    })
  for (let index = 0; index < 10; index += 1) {
    expect((await attempt(`10.9.${index}.1`)).status()).toBe(401)
  }
  const limited = await attempt("10.9.99.1")
  expect(limited.status()).toBe(429)
  expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0)
  // A different shopper behind the same proxy is unaffected.
  const other = await request.post("/api/auth/login", {
    headers: { origin: new URL(baseURL!).origin, "x-forwarded-for": shopperAddress() },
    data: { email: `nobody-${unique()}@example.test`, password: "wrongPassword1" },
  })
  expect(other.status()).toBe(401)
})

test("API errors never leak internals and personal responses aren't cached", async ({ request }) => {
  const response = await request.post("/api/cart", { data: "not json", headers: { "content-type": "application/json" } })
  expect(response.status()).toBe(422)
  const body = await response.json()
  expect(body.error.code).toBe("validation")
  expect(JSON.stringify(body)).not.toMatch(/stack|at .*\.js|supabase|postgres/i)
  expect(response.headers()["cache-control"]).toBe("no-store")
})
