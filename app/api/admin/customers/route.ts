import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { staffCustomers } from "@/server/customers"

const query = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  group: z.enum(["retail", "wholesale"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  size: z.coerce.number().int().min(1).max(100).catch(25),
})

export const GET = adminRoute("customers:read", async ({ request, staff }) => {
  const params = query.parse(Object.fromEntries(new URL(request.url).searchParams))
  return Response.json(await staffCustomers().list(staff, { q: params.q, group: params.group, page: params.page, pageSize: params.size }))
})
