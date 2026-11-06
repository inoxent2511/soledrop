import { describe, expect, it } from "vitest"

import { adminCsp } from "@/lib/admin-csp"

describe("admin CSP (A-012)", () => {
  it("runs no inline or eval'd script in production and frames nothing", () => {
    const csp = adminCsp("abc", false)
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'")
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
  })

  it("allows eval only for the dev server's error overlay", () => {
    expect(adminCsp("abc", true)).toContain("'unsafe-eval'")
  })
})
