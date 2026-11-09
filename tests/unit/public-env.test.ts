import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe("build-time public configuration", () => {
  it.each(["PKR", "USD", "AED", "GBP"])("retains validated %s values without a browser validator", async (currency) => {
    vi.resetModules()
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", " https://shop.example.test ")
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_CURRENCY", currency)
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "public-widget-key")
    const { publicEnv } = await import("@/lib/env"), { publicSchema } = await import("@/lib/env.public-schema")
    expect(publicEnv).toEqual(publicSchema.parse({ NEXT_PUBLIC_SITE_URL: " https://shop.example.test ", NEXT_PUBLIC_DEFAULT_CURRENCY: currency, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "public-widget-key" }))
  })
  it("retains defaults for empty build variables", async () => {
    vi.resetModules()
    for (const key of ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_DEFAULT_CURRENCY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"]) vi.stubEnv(key, "")
    expect((await import("@/lib/env")).publicEnv).toEqual({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000", NEXT_PUBLIC_DEFAULT_CURRENCY: "PKR", NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined })
  })
  it.each([
    ["NEXT_PUBLIC_SITE_URL", "not-a-url"],
    ["NEXT_PUBLIC_DEFAULT_CURRENCY", "invalid"],
  ])("still refuses invalid %s during server startup", async (key, value) => {
    vi.resetModules(); vi.stubEnv(key, value)
    await expect(import("@/lib/env.server")).rejects.toThrow(key)
  })
})
