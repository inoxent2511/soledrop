import "@/lib/validation"
import { z } from "zod"

/** Staff sign-in forms (shared by the admin forms and app/api/admin/auth/*). */
export const staffLoginSchema = z.object({
  email: z.email("Enter your work email").max(200),
  password: z.string().min(1, "Enter your password").max(200),
})

export const staffPasswordSchema = z.string().min(12, "Use at least 12 characters").max(200, "Use at most 200 characters")

export const acceptInviteSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your name").max(80),
  password: staffPasswordSchema,
})

/** A 6-digit authenticator code or a recovery code (xxxxx-xxxxx). */
export const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6, "Enter the 6-digit code")
    .max(20)
    .regex(/^(\d{3}\s?\d{3}|[0-9a-f]{5}-[0-9a-f]{5})$/i, "Enter the 6-digit code from your app, or a recovery code"),
})

/** Where to go after signing in: only a path inside the admin (no open redirect). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/admin") || next.startsWith("//") || next.includes("\\")) return "/admin"
  return next
}
