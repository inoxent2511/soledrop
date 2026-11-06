import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { staffCatalog } from "@/server/catalog"

const query = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  low: z.coerce.number().int().min(0).max(1000).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  size: z.coerce.number().int().min(1).max(200).catch(50),
})

/** Stock per size, lowest available first; `?low=2` keeps only sizes at or below 2. */
export const GET = adminRoute("inventory:read", async ({ request, staff }) => {
  const params = query.parse(Object.fromEntries(new URL(request.url).searchParams))
  return Response.json(await staffCatalog().stock(staff, { q: params.q, low: params.low, page: params.page, pageSize: params.size }))
})
