import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto"

/** Opaque random token (session, invite, recovery code) and the only form stored: its sha256. */
export const newToken = (bytes = 32): string => randomBytes(bytes).toString("base64url")
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex")

/** Ten readable recovery codes, `xxxxx-xxxxx`. */
export function newRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(8).toString("hex").slice(0, 10)
    return `${raw.slice(0, 5)}-${raw.slice(5)}`
  })
}

const keyFrom = (secret: string): Buffer => Buffer.from(hkdfSync("sha256", secret, "soledrop-admin", "totp-secret-seal", 32))

/** AES-256-GCM seal of a TOTP secret: `v1.<iv>.<tag>.<ciphertext>`, key derived from SESSION_SECRET. */
export function seal(plaintext: string, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv)
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".")
}

export function unseal(sealed: string, secret: string): string {
  const [version, iv, tag, body] = sealed.split(".")
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unknown seal format")
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8")
}
