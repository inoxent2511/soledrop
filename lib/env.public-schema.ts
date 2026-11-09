import "server-only"

import { z } from "zod"

export const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_DEFAULT_CURRENCY: z.enum(["PKR", "USD", "AED", "GBP"]).default("PKR"),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
})

export type PublicEnv = z.infer<typeof publicSchema>
