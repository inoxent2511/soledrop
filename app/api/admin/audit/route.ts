import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { staffPlatform } from "@/server/reports"

const query = z.object({
  actor: z.string().max(80).optional().catch(undefined),
  entity: z.string().max(40).optional().catch(undefined),
  action: z.string().max(60).optional().catch(undefined),
  q: z.string().trim().max(80).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
})

export const GET = adminRoute("audit:read", async ({ request, staff }) => {
  const params = query.parse(Object.fromEntries(new URL(request.url).searchParams))
  return Response.json(await staffPlatform().audit(staff, { ...params, pageSize: 50 }))
})
