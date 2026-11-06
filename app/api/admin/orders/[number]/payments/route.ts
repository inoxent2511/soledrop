import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { staffOrders } from "@/server/orders"

type Context = { params: Promise<{ number: string }> }

const schema = z.object({
  provider: z.enum(["cod", "bank_transfer"]),
  amount: z.number().int().positive().max(100_000_000_00),
  reference: z.string().trim().max(120).optional(),
  idempotencyKey: z.string().min(8).max(80),
})

/** Records cash collected or a bank transfer received; replaying the same key records it once. */
export const POST = adminRoute<Context>("orders:mark_paid", async ({ request, context, staff, meta }) => {
  const input = await parseBody(request, schema)
  const payment = await staffOrders().markPaid(staff, meta, (await context.params).number, input)
  return Response.json({ payment }, { status: 201 })
})
