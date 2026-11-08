import { z } from "zod"

import { currentStoreId } from "@/server/db/driver"
import { apiV1 } from "@/server/http/api-v1"
import { parseBody } from "@/server/http/route"
import { orderService } from "@/server/orders"
import { DomainError } from "@/server/shared/errors"
import { audit } from "@/server/platform/guards"

type Context = { params: Promise<{ number: string }> }

const schema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().min(3).max(500),
  lines: z.array(z.object({ orderLineId: z.uuid(), quantity: z.number().int().positive() })).default([]),
  restock: z.boolean().default(false),
  idempotencyKey: z.string().min(8).max(80),
})

export const POST = apiV1<Context>("write", async (request, client, { params }) => {
  const { number } = await params
  const input = await parseBody(request, schema)
  const service = orderService()
  const order = await service.lookupByNumber(currentStoreId(), number)
  if (!order) throw new DomainError("not_found", "Order not found.")
  const refund = await service.refund({ ...input, orderId: order.id, idempotencyKey: `api:${client.identity}:${input.idempotencyKey}` }, async () => {
    await audit(`api:${client.identity}`, "order.refunded", "order", order.number, null, { amount: input.amount, lines: input.lines, restock: input.restock })
  })
  return Response.json({ refund }, { status: 201 })
})
