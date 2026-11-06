import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { staffSearch } from "@/server/reports"

export const GET = adminRoute("search:read", async ({ request, staff }) => {
  const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).catch(30) }).parse(Object.fromEntries(new URL(request.url).searchParams))
  return Response.json(await staffSearch().report(staff, days))
})
