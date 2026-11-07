import "server-only"

import { z } from "zod"
import { adminNetworkPolicy } from "@/server/admin/network-policy"

const optionalSecret = z.string().min(1).optional()

/**
 * Server configuration, validated once at start-up so a missing or malformed value fails fast.
 * Every optional integration falls back to a documented local behaviour (docs/DEPLOYMENT-RUNBOOK.md).
 */
const serverSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATA_DRIVER: z.enum(["local", "fixtures", "supabase"]).default("local"),
    LOCAL_DATA_DIR: z.string().min(1).default(".data/store"),
    SUPABASE_URL: z.url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
    SESSION_SECRET: z.string().min(32).default("local-development-session-secret-change-me-0000"),
    // The seeded store (server/fixtures/seed.ts, supabase/seed.sql); one store per deployment.
    STORE_ID: z.string().min(1).default("00000000-0000-4000-8000-000000000001"),
    EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
    RESEND_API_KEY: optionalSecret,
    EMAIL_FROM: z.string().default("Sole Drop <orders@soledrop.local>"),
    STRIPE_SECRET_KEY: optionalSecret,
    STRIPE_WEBHOOK_SECRET: optionalSecret,
    TURNSTILE_SECRET_KEY: optionalSecret,
    // Bank-transfer payee; the option is hidden in production until all three are set.
    BANK_NAME: z.string().min(1).optional(),
    BANK_ACCOUNT_TITLE: z.string().min(1).optional(),
    BANK_IBAN: z
      .string()
      .refine((value) => /^PK\d{2}[A-Z]{4}\d{16}$/.test(value.replace(/\s/g, "")), "BANK_IBAN must be a 24-character Pakistani IBAN (PK36 SCBL 0000 0011 2345 6702)")
      .optional(),
    JOBS_SECRET: z.string().min(16).default("local-jobs-secret-0000"),
    API_KEYS: z.string().default(""),
    WEBHOOK_ENDPOINTS: z.string().default(""),
    FEATURE_FLAGS: z.string().default(""),
    RESERVATION_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    // Secure cookies in production. "false" only for serving the production build over plain-HTTP
    // loopback (qa/serve.mjs): WebKit drops Secure cookies on http://127.0.0.1 (BUG-010).
    COOKIE_SECURE: z.enum(["true", "false"]).optional(),
    // Reverse proxies in front of the app that append to X-Forwarded-For; rate limits key on the
    // address the outermost of them saw, never on client-written entries (BUG-015).
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
    // Demo staff accounts (one per preset role, known password and TOTP secret) for local work and
    // the e2e suite; fixtures driver only, refused with the real database (A-011).
    ADMIN_DEMO_STAFF: z.enum(["on", "off"]).default("off"),
    ADMIN_IP_ALLOWLIST: z.string().default("").refine((value) => { try { adminNetworkPolicy(value); return true } catch { return false } }, "ADMIN_IP_ALLOWLIST must contain valid comma-separated IP/CIDR rules"),
    AUTH_MAGIC_LINK: z.enum(["on", "off"]).default("off"),
    AUTH_EMAIL_VERIFICATION: z.enum(["on", "off"]).default("off"),
    OIDC_ISSUER: z.url().optional(),
    OIDC_CLIENT_ID: optionalSecret,
    OIDC_CLIENT_SECRET: optionalSecret,
  })
  .superRefine((env, context) => {
    const oidc = [env.OIDC_ISSUER, env.OIDC_CLIENT_ID, env.OIDC_CLIENT_SECRET]
    if (oidc.some(Boolean) && !oidc.every(Boolean)) context.addIssue({ code: "custom", message: "OIDC needs OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET together" })
    if (env.DATA_DRIVER === "supabase" && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
      context.addIssue({ code: "custom", message: "DATA_DRIVER=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY" })
    }
    if (env.EMAIL_PROVIDER === "resend" && !env.RESEND_API_KEY) {
      context.addIssue({ code: "custom", message: "EMAIL_PROVIDER=resend needs RESEND_API_KEY" })
    }
    if (env.NODE_ENV === "production" && env.SESSION_SECRET.startsWith("local-")) {
      context.addIssue({ code: "custom", message: "Set a real SESSION_SECRET in production" })
    }
    if (env.NODE_ENV === "production" && env.JOBS_SECRET.startsWith("local-")) {
      context.addIssue({ code: "custom", message: "Set a real JOBS_SECRET in production" })
    }
    if (env.ADMIN_DEMO_STAFF === "on" && env.DATA_DRIVER !== "fixtures") {
      context.addIssue({ code: "custom", message: "ADMIN_DEMO_STAFF=on is for the fixtures driver only; never with a real database" })
    }
  })

function readEnv() {
  const raw = Object.fromEntries(
    Object.keys(serverSchema.shape).map((key) => [key, process.env[key] || undefined]),
  )
  // `next build` evaluates modules with NODE_ENV=production but no runtime secrets; the start-up check is in instrumentation.
  if (process.env.NEXT_PHASE === "phase-production-build") raw.NODE_ENV = "test"
  return serverSchema.parse(raw)
}

export const serverEnv = readEnv()

export type ServerEnv = z.infer<typeof serverSchema>

/** Whether auth and cart cookies carry `Secure`: always in production unless COOKIE_SECURE=false. */
export function secureCookies(env: Pick<ServerEnv, "NODE_ENV" | "COOKIE_SECURE">): boolean {
  return env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : env.NODE_ENV === "production"
}
