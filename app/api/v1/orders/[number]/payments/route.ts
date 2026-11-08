import { z } from "zod"

import { currentStoreId } from "@/server/db/driver"
import { apiV1 } from "@/server/http/api-v1"
import { parseBody } from "@/server/http/route"
import { orderService } from "@/server/orders"
import { DomainError } from "@/server/shared/errors"

type Context = { params: Promise<{ number: string }> }

const schema = z.object({
  provider: z.enum(["cod", "bank_transfer"]),
  amount: z.number().int().positive(),
  reference: z.string().max(120).optional(),
  idempotencyKey: z.string().min(8).max(80),
})

/** Records an offline payment: cash collected by the courier or a bank transfer seen on the statement. */
export const POST = apiV1<Context>("write", async (request, client, { params }) => {
  const { number } = await params
  const input = await parseBody(request, schema)
  const service = orderService()
  const order = await service.lookupByNumber(currentStoreId(), number)
  if (!order) throw new DomainError("not_found", "Order not found.")
  const payment = await service.recordPayment({
    orderId: order.id,
    provider: input.provider,
    status: "captured",
    amount: input.amount,
    currency: order.currency,
    providerRef: input.reference ?? null,
    idempotencyKey: `api:${client.identity}:${input.idempotencyKey}`,
  })
  return Response.json({ payment }, { status: 201 })
})
