import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { staffOrders } from "@/server/orders"

type Context = { params: Promise<{ number: string; returnId: string }> }

const schema = z.object({ decision: z.enum(["approved", "rejected", "received"]), reason: z.string().trim().max(500).nullable().default(null) })

/** Approves, rejects or receives (restocks) a return request. */
export const POST = adminRoute<Context>("orders:returns", async ({ request, context, staff, meta }) => {
  const { number, returnId } = await context.params
  const input = await parseBody(request, schema)
  const result = await staffOrders().decideReturn(staff, meta, number, returnId, input.decision, input.reason)
  return Response.json({ return: result })
})
