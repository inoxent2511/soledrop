import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { serverEnv } from "@/lib/env.server"
import { DomainError, type DomainErrorCode } from "@/server/shared/errors"

let client: SupabaseClient | undefined

/**
 * Service-role client for the supabase driver. Server-only: the key bypasses RLS, so it is
 * read from lib/env.server.ts and never reaches the browser. RLS still protects every table
 * from the anon and authenticated roles (supabase/migrations).
 */
export function supabase(): SupabaseClient {
  if (!serverEnv.SUPABASE_URL || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    throw new DomainError("unavailable", "The database is not configured.")
  }
  client ??= createClient(serverEnv.SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  })
  return client
}

/** Codes our RPCs raise as "code: shopper-safe message" (supabase/migrations/*_functions.sql). */
const RAISED = /^(not_found|validation|out_of_stock|conflict|invalid_transition|promotion_invalid): ([\s\S]+)$/

/** Unwraps a supabase-js response, translating Postgres errors raised by our RPCs into DomainErrors. */
export function unwrap<T>(result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) {
    const message = result.error.message
    const raised = RAISED.exec(message)
    if (raised) throw new DomainError(raised[1] as DomainErrorCode, raised[2])
    if (result.error.code === "23514") throw new DomainError("out_of_stock", "Some items are no longer available in that quantity.")
    if (result.error.code === "23505") throw new DomainError("conflict", "That record already exists.")
    throw new Error(`Database error: ${message}`)
  }
  return result.data as T
}

/**
 * A staff search term safe to put inside a PostgREST `or=(…ilike.*term*…)` filter: the filter
 * syntax characters (, ( ) * % \ : . " ') become spaces. Search terms are plain words anyway.
 */
export const searchTerm = (value: string): string => value.replace(/[,()*%\\:."']/g, " ").trim().slice(0, 80)
