import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { staffOrders } from "@/server/orders"
import { ORDER_STATUSES } from "@/server/orders/types"

type Context = { params: Promise<{ number: string }> }

const schema = z.object({
  to: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(500).optional(),
  trackingNumber: z.string().trim().max(80).optional(),
  reason: z.string().trim().max(500).nullable().optional(),
  expectedUpdatedAt: z.string().max(40).optional(),
})

/**
 * Moves an order along the state machine. Declared at orders:read; the target status's own
 * permission (fulfil, cancel, mark paid, returns) is checked in server/orders/staff.ts.
 */
export const POST = adminRoute<Context>("orders:read", async ({ request, context, staff, meta }) => {
  const input = await parseBody(request, schema)
  const order = await staffOrders().transition(staff, meta, (await context.params).number, input)
  return Response.json({ status: order.status, updatedAt: order.updatedAt })
})
