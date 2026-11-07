import { describe, expect, it } from "vitest"
import { assertRequestOrigin } from "@/server/http/origin"

describe("mutation origin boundary", () => {
  const options = { siteUrl: "https://shop.example.test", allowLoopbackHttp: false }
  const request = (origin?: string, cookie?: string, path = "/api/account") => new Request("https://shop.example.test" + path, { method: "POST", headers: { ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}) } })
  it("requires Origin for every authenticated realm and guest cart cookie", () => {
    for (const cookie of ["sd_session=opaque", "sd_staff=opaque", "other=1; sd_cart=opaque"]) expect(() => assertRequestOrigin(request(undefined, cookie), options)).toThrow("Cross-site")
  })
  it("rejects malformed, null, foreign and cross-scheme origins with a safe error", () => {
    for (const origin of ["null", "not a url", "http://shop.example.test", "https://evil.example.test", "https://shop.example.test/", "https://shop.example.test.evil.test"]) expect(() => assertRequestOrigin(request(origin, "sd_session=opaque"), options)).toThrow("Cross-site")
    expect(() => assertRequestOrigin(request(options.siteUrl, "sd_session=opaque"), options)).not.toThrow()
  })
  it("protects public login against login CSRF while allowing signed/bearer machine calls", () => {
    for (const path of ["/api/auth/login", "/api/auth/register", "/api/admin/auth/login"]) expect(() => assertRequestOrigin(request(undefined, undefined, path), options)).toThrow("Cross-site")
    for (const path of ["/api/jobs/outbox", "/api/webhooks/stripe", "/api/v1/products/import"]) expect(() => assertRequestOrigin(request(undefined, undefined, path), options)).not.toThrow()
  })
  it("allows only the exact loopback preview origin when explicitly configured", () => {
    const local = new Request("http://127.0.0.1:3400/api/cart", { method: "POST", headers: { origin: "http://127.0.0.1:3400", cookie: "sd_cart=opaque" } })
    expect(() => assertRequestOrigin(local, options)).toThrow()
    expect(() => assertRequestOrigin(local, { ...options, allowLoopbackHttp: true })).not.toThrow()
    const different = new Request(local, { headers: { origin: "http://127.0.0.1:3401", cookie: "sd_cart=opaque" } })
    expect(() => assertRequestOrigin(different, { ...options, allowLoopbackHttp: true })).toThrow()
  })
})
