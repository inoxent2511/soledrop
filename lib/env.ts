import type { PublicEnv } from "./env.public-schema"

/**
 * Public (browser-safe) configuration. Only `NEXT_PUBLIC_*` values live here; Next inlines each
 * one at build time, so they are listed explicitly rather than spreading `process.env`.
 */
// The server validates these build-time values before serving pages; browsers need no validator.
export const publicEnv = {
  NEXT_PUBLIC_SITE_URL: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").trim(),
  NEXT_PUBLIC_DEFAULT_CURRENCY: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || "PKR",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined,
} as PublicEnv

export type { PublicEnv }
