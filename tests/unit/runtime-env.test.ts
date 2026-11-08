import { afterEach, beforeEach, expect, it, vi } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv("NODE_ENV", "test")
  vi.stubEnv("NEXT_PHASE", undefined)
  vi.stubEnv("DATA_DRIVER", undefined)
  vi.stubEnv("DATABASE_URL", "mysql://fake:fake@127.0.0.1:3307/soledrop_qa_env")
  vi.stubEnv("SESSION_SECRET", undefined)
  vi.stubEnv("AUTH_SECRET", undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

it("defaults to MySQL and preserves an AUTH_SECRET alias as the existing encryption key", async () => {
  const key = "test-only-preserved-encryption-key-" + "x".repeat(32)
  vi.stubEnv("AUTH_SECRET", key)
  const { serverEnv } = await import("@/lib/env.server")
  expect(serverEnv.DATA_DRIVER).toBe("mysql")
  expect(serverEnv.SESSION_SECRET).toBe(key)
})
it("rejects conflicting secret names instead of silently rotating imported MFA/link encryption", async () => {
  vi.stubEnv("AUTH_SECRET", "a".repeat(48)); vi.stubEnv("SESSION_SECRET", "b".repeat(48))
  await expect(import("@/lib/env.server")).rejects.toThrow("AUTH_SECRET and SESSION_SECRET must agree")
})
it("permits a credential-free build but rejects a credential-free MySQL runtime", async () => {
  vi.stubEnv("DATABASE_URL", undefined)
  await expect(import("@/lib/env.server")).rejects.toThrow("requires DATABASE_URL")
  vi.resetModules(); vi.stubEnv("NEXT_PHASE", "phase-production-build")
  const { serverEnv } = await import("@/lib/env.server")
  expect(serverEnv.DATA_DRIVER).toBe("mysql")
  expect(serverEnv.DATABASE_URL).toBeUndefined()
})
