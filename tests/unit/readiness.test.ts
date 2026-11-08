import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DomainError } from "@/server/shared/errors"
import { runtimeReadiness } from "@/server/runtime/readiness"
import { GET } from "@/app/api/ready/route"

const probes = vi.hoisted(() => ({ database: vi.fn(), store: vi.fn(), storage: vi.fn(), email: vi.fn() }))
vi.mock("@/server/db/client", () => ({ databaseStatus: probes.database }))
vi.mock("@/server/db/driver", () => ({ dataDriver: () => "mysql" }))
vi.mock("@/server/runtime/readiness.repository", () => ({ deploymentStoreExists: probes.store }))
vi.mock("@/server/platform", () => ({ platform: () => ({ ping: async () => true }) }))
vi.mock("@/server/adapters/storage", () => ({ storage: () => ({ writable: probes.storage }) }))
vi.mock("@/server/adapters/email", () => ({ email: () => ({ provider: { verify: probes.email } }) }))
let at = Date.now()
beforeEach(() => {
  vi.useFakeTimers(); at += 31_000; vi.setSystemTime(at)
  for (const probe of Object.values(probes)) probe.mockReset()
  probes.database.mockResolvedValue({ engine: "mariadb", version: "10.11.15", migration: "0013_refund_intents.sql", schemaVerified: true, poolMax: 5 })
  probes.store.mockResolvedValue(true); probes.storage.mockResolvedValue(true); probes.email.mockResolvedValue(true)
})
afterEach(() => { vi.useRealTimers() })

describe("complete runtime readiness", () => {
  it("reports the verified engine/version with no private configuration", async () => {
    const response = await GET(), body = await response.json()
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(body).toMatchObject({ status: "ready", driver: "mysql", engine: "mariadb", version: "10.11.15", checks: { database: true, schema: true, store: true, storage: true, email: true } })
    expect(JSON.stringify(body)).not.toMatch(/password|secret|DATABASE_URL|STORAGE_DIR/)
  })
  it.each(["store", "storage", "email"] as const)("returns 503 when %s is unavailable", async (check) => {
    probes[check].mockResolvedValue(false)
    const response = await GET(), body = await response.json()
    expect(response.status).toBe(503)
    expect(body.checks[check]).toBe(false)
  })
  it("distinguishes a live database with a mismatched schema", async () => {
    probes.database.mockRejectedValue(new DomainError("unavailable", "Schema mismatch", { check: "schema" }))
    expect(await runtimeReadiness()).toMatchObject({ status: "unavailable", checks: { database: true, schema: false } })
  })
  it("bounds failed probes and briefly shares SMTP verification across readiness calls", async () => {
    probes.database.mockRejectedValue(new DomainError("unavailable", "Disconnected"))
    probes.storage.mockRejectedValue(new Error("Disk full"))
    const first = await runtimeReadiness(), second = await runtimeReadiness()
    expect(first).toMatchObject({ status: "unavailable", checks: { database: false, storage: false } })
    expect(second.status).toBe("unavailable")
    expect(probes.email).toHaveBeenCalledTimes(1)
    at += 31_000; vi.setSystemTime(at)
    await runtimeReadiness()
    expect(probes.email).toHaveBeenCalledTimes(2)
  })
})
