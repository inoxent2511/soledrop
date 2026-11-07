import { createHash, timingSafeEqual } from "node:crypto"
import { DomainError } from "@/server/shared/errors"

// Offline deny-list: no password or digest is sent to a third party. This is deliberately
// limited coverage, not a claim to replace a full compromised-password corpus.
const compromised = ["12345678", "123456789", "1234567890", "password", "password1", "password123", "password1234", "password12345", "qwerty123", "qwertyuiop", "admin123", "admin123456", "letmein123", "welcome123", "iloveyou", "123456abcdef"].map((value) => createHash("sha256").update(value).digest())

export function assertPasswordPolicy(password: string, minimum = 8) {
  if (password.length < minimum || password.length > 200) throw new DomainError("validation", `Use between ${minimum} and 200 characters.`, { field: "password" })
  const digest = createHash("sha256").update(password.normalize("NFKC").toLowerCase()).digest()
  let found = false
  for (const candidate of compromised) found = timingSafeEqual(candidate, digest) || found
  if (found) throw new DomainError("validation", "Choose a password that isn't commonly used.", { field: "password" })
}
