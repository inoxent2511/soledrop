import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { staffPlatform } from "@/server/reports"
import { DomainError } from "@/server/shared/errors"

type Context = { params: Promise<{ name: string }> }

const JOBS = z.enum(["outbox", "release-reservations", "purge-carts"])

/** Runs a background job now. */
export const POST = adminRoute<Context>("jobs:run", async ({ context, staff, meta }) => {
  const parsed = JOBS.safeParse((await context.params).name)
  if (!parsed.success) throw new DomainError("not_found", "Unknown job.")
  return Response.json({ result: await staffPlatform().runJob(staff, meta, parsed.data) })
})
