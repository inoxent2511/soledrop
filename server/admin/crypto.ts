import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto"

/** Opaque random token (session, invite, recovery code) and the only form stored: its sha256. */
export const newToken = (bytes = 32): string => randomBytes(bytes).toString("base64url")
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex")

export function sameTokenHash(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"))
}

/** Ten readable recovery codes, `xxxxx-xxxxx`. */
export function newRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(8).toString("hex").slice(0, 10)
    return `${raw.slice(0, 5)}-${raw.slice(5)}`
  })
}

const keyFrom = (secret: string, purpose = "totp-secret-seal"): Buffer => Buffer.from(hkdfSync("sha256", secret, "soledrop-admin", purpose, 32))

/** AES-256-GCM seal of a TOTP secret: `v1.<iv>.<tag>.<ciphertext>`, key derived from SESSION_SECRET. */
export function seal(plaintext: string, secret: string, purpose?: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret, purpose), iv)
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".")
}

export function unseal(sealed: string, secret: string, purpose?: string): string {
  const [version, iv, tag, body] = sealed.split(".")
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unknown seal format")
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret, purpose), Buffer.from(iv, "base64url"))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8")
}
