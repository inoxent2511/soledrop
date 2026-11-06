import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { staffMarketing } from "@/server/reports"

const query = z.object({ hours: z.coerce.number().int().min(1).max(24 * 30).catch(2), page: z.coerce.number().int().min(1).max(10_000).catch(1) })

/** Bags left with something in them for `hours` (default 2). */
export const GET = adminRoute("marketing:read", async ({ request, staff }) => {
  const params = query.parse(Object.fromEntries(new URL(request.url).searchParams))
  return Response.json(await staffMarketing().abandoned(staff, { olderThanHours: params.hours, page: params.page, pageSize: 50 }))
})
