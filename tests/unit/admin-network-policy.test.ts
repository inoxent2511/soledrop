import { describe, expect, it } from "vitest"
import { adminNetworkPolicy } from "@/server/admin/network-policy"

describe("optional admin network policy", () => {
  it("allows every network only when no restrictions were configured", () => {
    expect(adminNetworkPolicy("")(null)).toBe(true)
  })
  it("matches IPv4/IPv6 and CIDRs, rejects missing/foreign/malformed addresses", () => {
    const allows = adminNetworkPolicy("192.0.2.5,198.51.100.0/24,2001:db8::/48")
    for (const address of ["192.0.2.5", "198.51.100.254", "::ffff:192.0.2.5", "2001:db8:0:1::1"]) expect(allows(address)).toBe(true)
    for (const address of [null, "unknown", "192.0.2.6", "198.51.101.1", "2001:db9::1", "192.0.2.5,203.0.113.1"]) expect(allows(address)).toBe(false)
  })
  it("fails closed for invalid configuration", () => {
    for (const rule of ["*", "localhost", "192.0.2.0/33", "::/129", "192.0.2.0/", "192.0.2.0/24/1"]) expect(() => adminNetworkPolicy(rule)).toThrow()
  })
})
