import "server-only"

import { timingSafeEqual } from "node:crypto"

import { serverEnv } from "@/lib/env.server"
import { errorResponse } from "@/server/http/route"
import { DomainError } from "@/server/shared/errors"
import { withActor } from "@/server/db/context"
import { systemActor } from "@/server/db/actor"

/**
 * Scheduled POST endpoints use Authorization: Bearer $CRON_SECRET.
 * JOBS_SECRET remains an alias for existing local configurations during migration.
 */
export function job(work: () => Promise<Record<string, unknown>>) {
  return async (request: Request) => {
    try {
      const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "")
      const expected = Buffer.from(serverEnv.CRON_SECRET ?? serverEnv.JOBS_SECRET)
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new DomainError("unauthorized", "Invalid job credentials.")
      const started = Date.now()
      const result = await withActor(systemActor(serverEnv.STORE_ID, "jobs", ["jobs:run"]), work)
      return Response.json({ ok: true, ...result, durationMs: Date.now() - started }, { headers: { "cache-control": "no-store" } })
    } catch (error) {
      return errorResponse(error)
    }
  }
}
