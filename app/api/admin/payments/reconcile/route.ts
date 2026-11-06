import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { staffOrders } from "@/server/orders"

/** Records a bank transfer from the statement against its order; replaying the same key records it once. */
export const POST = adminRoute("payments:reconcile", async ({ request, staff, meta }) => {
  const input = await parseBody(request, z.object({ number: z.string().trim().min(3).max(20), amount: z.number().int().positive(), reference: z.string().trim().min(2, "Add the bank reference").max(120), idempotencyKey: z.string().min(8).max(80) }))
  const payment = await staffOrders().reconcile(staff, meta, input.number, input)
  return Response.json({ payment }, { status: 201 })
})
