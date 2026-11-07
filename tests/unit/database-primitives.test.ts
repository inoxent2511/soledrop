import { describe, expect, it } from "vitest"
import { uuidFromBytes, uuidToBytes, uuidv7 } from "@/server/db/uuid"
import { statements, supportedEngine } from "../../scripts/database-common.mjs"

describe("portable database primitives", () => {
  it("generates unique monotonically ordered UUIDv7 identifiers across bursts and clock rollback", () => {
    const ids = Array.from({ length: 10_000 }, () => uuidv7(1_800_000_000_000))
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(ids)
    expect(uuidv7(1) > ids.at(-1)!).toBe(true)
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
  it("roundtrips legacy UUIDs without byte swapping and rejects malformed keys", () => {
    const id = "00000000-0000-4000-8000-000000000001"
    expect(uuidFromBytes(uuidToBytes(id))).toBe(id)
    expect(() => uuidToBytes("not-a-uuid")).toThrow()
    expect(() => uuidFromBytes(Buffer.alloc(15))).toThrow()
  })
  it("rejects engines that ignore CHECK constraints", () => {
    for (const version of ["5.7.44", "8.0.15"]) expect(() => supportedEngine(version)).toThrow("Unsupported")
    expect(() => supportedEngine("10.5.29-MariaDB")).toThrow("Unsupported")
    expect(supportedEngine("8.0.16").engine).toBe("mysql")
    expect(supportedEngine("8.4.9").engine).toBe("mysql")
    expect(supportedEngine("5.5.5-10.11.15-MariaDB").version).toBe("10.11.15")
  })
  it("parses SQL containing comments and quoted semicolons safely", () => {
    expect(statements("-- header\nSELECT ';'; /* hidden ; */ SELECT 'it''s; valid'; # comment\nSELECT 3;")).toEqual(["SELECT ';'", "SELECT 'it''s; valid'", "SELECT 3"])
    expect(() => statements("SELECT 'unterminated")).toThrow()
  })
})
