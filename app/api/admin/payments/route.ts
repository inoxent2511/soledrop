import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { staffOrders } from "@/server/orders"

const query = z.object({
  kind: z.enum(["payments", "refunds"]).catch("payments"),
  provider: z.enum(["cod", "bank_transfer", "stripe"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  size: z.coerce.number().int().min(1).max(200).catch(50),
})

/** The money ledger: payments or refunds, newest first. */
export const GET = adminRoute("payments:read", async ({ request, staff }) => {
  const params = query.parse(Object.fromEntries(new URL(request.url).searchParams))
  return Response.json(await staffOrders().ledger(staff, { kind: params.kind, provider: params.provider, page: params.page, pageSize: params.size }))
})
