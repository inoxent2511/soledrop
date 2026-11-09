import { describe, expect, it, vi } from "vitest"

describe("separately loaded server graphs", () => {
  it("preserves expected errors through a shared pool and a wrapped query failure", async () => {
    const first = await import("@/server/shared/errors")
    const original = new first.DomainError("forbidden", "Permission required", { permission: "orders:read" })
    vi.resetModules()
    const second = await import("@/server/shared/errors")
    expect(first.DomainError).not.toBe(second.DomainError)
    expect(original).toBeInstanceOf(second.DomainError)
    expect(second.isDomainError(original)).toBe(true)
    expect(original.status).toBe(403)
    const { databaseError } = await import("@/server/db/client")
    expect(databaseError(original)).toBe(original)
    expect(databaseError(new Error("Query and parameters must stay private", { cause: original }))).toBe(original)
  })
  it("does not trust an error name/code or a JSON copy without the private brand", async () => {
    const { DomainError, isDomainError } = await import("@/server/shared/errors")
    expect(isDomainError(Object.assign(new Error("Private SQL"), { name: "DomainError", code: "forbidden" }))).toBe(false)
    expect(isDomainError(JSON.parse(JSON.stringify(new DomainError("forbidden", "Safe"))))).toBe(false)
    class SpecificError extends DomainError {}
    expect(new DomainError("forbidden", "Safe")).not.toBeInstanceOf(SpecificError)
    expect(new SpecificError("forbidden", "Safe")).toBeInstanceOf(SpecificError)
  })
})
