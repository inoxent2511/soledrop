import "@/lib/validation"
import * as z from "zod/mini"

/**
 * Public (browser-safe) configuration. Only `NEXT_PUBLIC_*` values live here; Next inlines each
 * one at build time, so they are listed explicitly rather than spreading `process.env`.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z._default(z.url(), "http://localhost:3000"),
  NEXT_PUBLIC_DEFAULT_CURRENCY: z._default(z.enum(["PKR", "USD", "AED", "GBP"]), "PKR"),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.optional(z.string().check(z.minLength(1))),
})

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  NEXT_PUBLIC_DEFAULT_CURRENCY: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || undefined,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined,
})

export type PublicEnv = z.infer<typeof publicSchema>
