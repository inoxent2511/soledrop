import { generateSecret, generateSync, verifySync } from "otplib"

/**
 * otplib 13: SHA-1, 30-second steps and six digits preserve enrolled authenticators.
 * Explicit epochs keep RFC vectors and replay accounting independent of the wall clock.
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
export const generateTotpSecret = (): string => generateSecret({ length: 20 })

/** The code for `at` (ms since epoch). */
export const totpAt = (secretBase32: string, at: number): string => generateSync({ secret: secretBase32, epoch: at / 1000, algorithm: "sha1", digits: DIGITS, period: STEP_SECONDS })

/**
 * Accepts the current code or one step either side (clock drift), compared in constant time.
 * Returns the matched step so callers can refuse a replay of the same step.
 */
export function verifyTotp(secretBase32: string, code: string, at: number, window = 1): number | null {
  const normalized = code.replace(/\s/g, "")
  if (!/^\d{6}$/.test(normalized)) return null
  if (!Number.isInteger(window) || window < 0 || window > 1) return null
  try {
    const result = verifySync({ secret: secretBase32, token: normalized, epoch: at / 1000, algorithm: "sha1", digits: DIGITS, period: STEP_SECONDS, epochTolerance: window * STEP_SECONDS })
    return result.valid ? Math.floor(at / 1000 / STEP_SECONDS) + (result.delta ?? 0) : null
  } catch { return null }
}

/** The otpauth:// URI authenticator apps read from the enrolment QR code. */
export function otpauthUri(secretBase32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) })
  return `otpauth://totp/${label}?${params.toString()}`
}
