import "server-only"

import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto"

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCallback(password, salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key))))

// OWASP's 32 MiB profile balances the shared-host memory budget with password guessing cost.
const PARAMS = { N: 32768, r: 8, p: 3 }
const KEY_LENGTH = 64

/** scrypt with a per-password salt, encoded as `scrypt$N$r$p$salt$hash` so parameters can evolve. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { ...PARAMS, maxmem: 64 * 1024 * 1024 })
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), key.toString("base64url")].join("$")
}

/** A real hash of a random password, verified for unknown emails so timing doesn't reveal accounts. */
let decoy: Promise<string> | undefined
export const decoyHash = () => (decoy ??= hashPassword(randomBytes(16).toString("hex")))

export function passwordNeedsRehash(encoded: string): boolean {
  const [scheme, n, r, p] = encoded.split("$")
  return scheme !== "scrypt" || Number(n) !== PARAMS.N || Number(r) !== PARAMS.r || Number(p) !== PARAMS.p
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash, extra] = encoded.split("$")
  const cost = Number(n), block = Number(r), parallel = Number(p)
  if (scheme !== "scrypt" || !salt || !hash || extra || ![16384, 32768].includes(cost) || block !== 8 || ![1, 3, 5].includes(parallel) || password.length > 200) return false
  try {
    const expected = Buffer.from(hash, "base64url"), saltBytes = Buffer.from(salt, "base64url")
    if (expected.length !== KEY_LENGTH || saltBytes.length !== 16) return false
    const key = await scrypt(password.normalize("NFKC"), saltBytes, KEY_LENGTH, { N: cost, r: block, p: parallel, maxmem: 64 * 1024 * 1024 })
    // Legacy verification does equivalent work to the current profile for unknown-email parity.
    const remainingWork = PARAMS.N * PARAMS.p / 16384 - cost * parallel / 16384
    if (remainingWork > 0) await scrypt(password.normalize("NFKC"), saltBytes, KEY_LENGTH, { N: 16384, r: 8, p: remainingWork, maxmem: 64 * 1024 * 1024 })
    return timingSafeEqual(key, expected)
  } catch { return false }
}
