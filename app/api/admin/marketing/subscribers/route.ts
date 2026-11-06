import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { staffMarketing } from "@/server/reports"

const query = z.object({ status: z.enum(["subscribed", "unsubscribed"]).optional().catch(undefined), page: z.coerce.number().int().min(1).max(10_000).catch(1) })

export const GET = adminRoute("marketing:read", async ({ request, staff }) => {
  const params = query.parse(Object.fromEntries(new URL(request.url).searchParams))
  return Response.json(await staffMarketing().subscribers(staff, { status: params.status, page: params.page, pageSize: 50 }))
})
