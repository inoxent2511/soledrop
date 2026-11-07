import { scryptSync } from "node:crypto"
import { describe, expect, it } from "vitest"
import { hashPassword, passwordNeedsRehash, verifyPassword } from "@/server/customers/password"

describe("password storage migration", () => {
  const password = "correct horse battery staple"
  it("uses the 32 MiB scrypt profile with independent salts and no plaintext", async () => {
    const first = await hashPassword(password), second = await hashPassword(password)
    expect(first).toMatch(/^scrypt\$32768\$8\$3\$/)
    expect(first).not.toBe(second)
    expect(first).not.toContain(password)
    expect(await verifyPassword(password, first)).toBe(true)
    expect(await verifyPassword("incorrect password", first)).toBe(false)
    expect(passwordNeedsRehash(first)).toBe(false)
  })
  it("accepts the imported legacy hash and marks it for a successful-login upgrade", async () => {
    const salt = Buffer.alloc(16, 17)
    const key = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
    const legacy = ["scrypt", 16384, 8, 1, salt.toString("base64url"), key.toString("base64url")].join("$")
    expect(passwordNeedsRehash(legacy)).toBe(true)
    expect(await verifyPassword(password, legacy)).toBe(true)
    expect(await verifyPassword("incorrect password", legacy)).toBe(false)
  })
  it("fails closed for corrupt hashes, unsupported work factors and key lengths", async () => {
    for (const value of ["", "scrypt$1073741824$8$1$salt$hash", "scrypt$32768$8$3$aA$aA", "scrypt$32768$8$3$salt$hash$extra"]) expect(await verifyPassword(password, value)).toBe(false)
  })
})
