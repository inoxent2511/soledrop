import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { staffOrders } from "@/server/orders"

type Context = { params: Promise<{ number: string }> }

const schema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().trim().min(3, "Give a reason").max(500),
  lines: z.array(z.object({ orderLineId: z.uuid(), quantity: z.number().int().positive() })).max(100).default([]),
  restock: z.boolean().default(false),
  idempotencyKey: z.string().min(8).max(80),
})

/** Refunds within the member's ceiling; needs a fresh second factor (A-003). */
export const POST = adminRoute<Context>({ permission: "orders:refund", stepUp: true }, async ({ request, context, staff, meta }) => {
  const input = await parseBody(request, schema)
  const refund = await staffOrders().refund(staff, meta, (await context.params).number, input)
  return Response.json({ refund }, { status: 201 })
})
