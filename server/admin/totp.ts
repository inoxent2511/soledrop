import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

/**
 * TOTP (RFC 6238 over RFC 4226 HOTP): SHA-1, 30-second steps, 6 digits, the parameters every
 * authenticator app accepts. Pure apart from the clock and randomness passed in.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const STEP_SECONDS = 30
const DIGITS = 6

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31]
  return output
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "")
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index === -1) throw new Error("Invalid base32 character")
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** A new 160-bit secret, base32 (what authenticator apps store). */
export const generateTotpSecret = (): string => base32Encode(randomBytes(20))

function hotp(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac("sha1", secret).update(message).digest()
  const offset = digest[digest.length - 1] & 15
  const code = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3]
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0")
}

/** The code for `at` (ms since epoch). */
export const totpAt = (secretBase32: string, at: number): string => hotp(base32Decode(secretBase32), Math.floor(at / 1000 / STEP_SECONDS))

/**
 * Accepts the current code or one step either side (clock drift), compared in constant time.
 * Returns the matched step so callers can refuse a replay of the same step.
 */
export function verifyTotp(secretBase32: string, code: string, at: number, window = 1): number | null {
  const normalized = code.replace(/\s/g, "")
  if (!/^\d{6}$/.test(normalized)) return null
  const secret = base32Decode(secretBase32)
  const step = Math.floor(at / 1000 / STEP_SECONDS)
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = hotp(secret, step + offset)
    if (timingSafeEqual(Buffer.from(candidate), Buffer.from(normalized))) return step + offset
  }
  return null
}

/** The otpauth:// URI authenticator apps read from the enrolment QR code. */
export function otpauthUri(secretBase32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) })
  return `otpauth://totp/${label}?${params.toString()}`
}
