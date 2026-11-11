import { describe, expect, it } from "vitest"

import { secureCookies } from "@/lib/env.server"
import { forwardedClient } from "@/server/http/client-key"

import nextConfig, { STOREFRONT } from "../../next.config.mjs"

async function headerValue(source: string, key: string) {
  const rules = (await nextConfig.headers?.()) ?? []
  return rules.find((rule) => rule.source === source)?.headers.find((header) => header.key === key)?.value ?? ""
}

describe("security headers", () => {
  it("keeps the CSP same-origin and lets loopback HTTP work in every engine (BUG-009)", async () => {
    const csp = await headerValue(STOREFRONT, "Content-Security-Policy")
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toContain("upgrade-insecure-requests")
  })

  it("pins HTTPS with HSTS and keeps API responses out of caches", async () => {
    expect(await headerValue("/:path*", "Strict-Transport-Security")).toMatch(/max-age=\d{8,}/)
    expect(await headerValue("/api/:path*", "Cache-Control")).toBe("no-store")
  })

  it("marks cookies Secure in production unless loopback QA opts out (BUG-010)", () => {
    expect(secureCookies({ NODE_ENV: "production", COOKIE_SECURE: undefined })).toBe(true)
    expect(secureCookies({ NODE_ENV: "production", COOKIE_SECURE: "false" })).toBe(false)
    expect(secureCookies({ NODE_ENV: "development", COOKIE_SECURE: undefined })).toBe(false)
    expect(secureCookies({ NODE_ENV: "development", COOKIE_SECURE: "true" })).toBe(true)
  })

  it("keys rate limits on the proxy-appended address, not a forged X-Forwarded-For (BUG-015)", () => {
    // The client sends "1.1.1.1"; one trusted proxy appends the real peer.
    expect(forwardedClient("1.1.1.1, 203.0.113.9", 1)).toBe("203.0.113.9")
    expect(forwardedClient("1.1.1.1, 2.2.2.2, 203.0.113.9, 10.0.0.2", 2)).toBe("203.0.113.9")
    expect(forwardedClient("203.0.113.9", 1)).toBe("203.0.113.9")
    expect(forwardedClient("203.0.113.9", 3)).toBe("203.0.113.9")
    expect(forwardedClient("1.1.1.1", 0)).toBe("direct")
    expect(forwardedClient(null, 1)).toBe("direct")
    expect(forwardedClient(" , ", 1)).toBe("direct")
  })
})
