import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { hashToken, newRecoveryCodes, seal, unseal } from "@/server/admin/crypto"
import { ALL_PERMISSIONS, OWNER_ROLE_KEY, PERMISSION_GROUPS, PERMISSIONS, PRESET_ROLES, isPermission, isSensitive, renderPermissionMatrix } from "@/server/admin/permissions"
import { base32Decode, base32Encode, totpAt, verifyTotp } from "@/server/admin/totp"

const DOC = path.resolve(import.meta.dirname, "../../docs/app/admin/permissions.md")

describe("permission registry", () => {
  it("names every permission resource:action inside a known group", () => {
    for (const key of ALL_PERMISSIONS) {
      expect(key).toMatch(/^[a-z_]+:[a-z_]+$/)
      expect(PERMISSION_GROUPS).toContain(PERMISSIONS[key].group)
    }
  })

  it("gives presets only real permissions, Owner all of them, and Read-only no writes or PII", () => {
    for (const role of PRESET_ROLES) for (const permission of role.permissions) expect(isPermission(permission), `${role.key}: ${permission}`).toBe(true)
    expect(new Set(PRESET_ROLES.map((role) => role.key)).size).toBe(PRESET_ROLES.length)
    expect(PRESET_ROLES.find((role) => role.key === OWNER_ROLE_KEY)?.permissions).toEqual(ALL_PERMISSIONS)
    const readOnly = PRESET_ROLES.find((role) => role.key === "read_only")?.permissions ?? []
    expect(readOnly.every((permission) => permission.endsWith(":read"))).toBe(true)
    expect(readOnly).not.toContain("customers:read_pii")
    expect(readOnly).not.toContain("audit:read")
  })

  it("keeps staff and role management with Owner and Admin, and refunds within a ceiling", () => {
    for (const permission of ["staff:manage", "roles:manage"] as const) {
      expect(PRESET_ROLES.filter((role) => role.permissions.includes(permission)).map((role) => role.key).sort()).toEqual(["admin", "owner"])
    }
    for (const role of PRESET_ROLES.filter((entry) => entry.permissions.includes("orders:refund") && !["owner", "admin"].includes(entry.key))) {
      expect(role.refundLimit, role.key).toBeGreaterThan(0)
    }
    expect(isSensitive("orders:refund")).toBe(true)
    expect(isSensitive("orders:read")).toBe(false)
  })

  it("keeps docs/app/admin/permissions.md in sync (pnpm admin:docs)", () => {
    const rendered = renderPermissionMatrix()
    if (process.env.WRITE_ADMIN_DOCS === "1") fs.writeFileSync(DOC, rendered)
    expect(fs.readFileSync(DOC, "utf8").replace(/\r\n/g, "\n")).toBe(rendered)
  })
})

describe("TOTP (RFC 6238)", () => {
  // RFC 6238 appendix B, SHA-1 secret "12345678901234567890"; six-digit codes are the last six digits.
  const secret = base32Encode(Buffer.from("12345678901234567890"))
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("at %is gives %s", (seconds, code) => {
    expect(totpAt(secret, seconds * 1000)).toBe(code)
  })

  it("accepts one step of drift either side, nothing further, and reports the step", () => {
    const at = 1_800_000_000_000
    const step = Math.floor(at / 30_000)
    expect(verifyTotp(secret, totpAt(secret, at), at)).toBe(step)
    expect(verifyTotp(secret, totpAt(secret, at - 30_000), at)).toBe(step - 1)
    expect(verifyTotp(secret, totpAt(secret, at + 30_000), at)).toBe(step + 1)
    expect(verifyTotp(secret, totpAt(secret, at - 60_000), at)).toBeNull()
    expect(verifyTotp(secret, "12345", at)).toBeNull()
    expect(verifyTotp(secret, "abcdef", at)).toBeNull()
  })

  it("round-trips base32", () => {
    const bytes = Buffer.from([0, 1, 2, 250, 255, 128, 64])
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes)
  })
})

describe("admin crypto", () => {
  it("seals TOTP secrets so a different key or a tampered value fails", () => {
    const key = "a".repeat(40)
    const sealed = seal("JBSWY3DPEHPK3PXP", key)
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP")
    expect(unseal(sealed, key)).toBe("JBSWY3DPEHPK3PXP")
    expect(() => unseal(sealed, "b".repeat(40))).toThrow()
    const parts = sealed.split(".")
    parts[3] = Buffer.from("tampered").toString("base64url")
    expect(() => unseal(parts.join("."), key)).toThrow()
  })

  it("issues ten distinct recovery codes and stores only hashes", () => {
    const codes = newRecoveryCodes()
    expect(new Set(codes).size).toBe(10)
    for (const code of codes) expect(code).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/)
    expect(hashToken(codes[0])).toMatch(/^[0-9a-f]{64}$/)
  })
})
