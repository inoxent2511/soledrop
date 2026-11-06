import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { staffCustomers } from "@/server/customers"
import { parseBody } from "@/server/http/route"

type Context = { params: Promise<{ id: string }> }

const update = z.object({
  fullName: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  group: z.enum(["retail", "wholesale"]).optional(),
  marketingOptIn: z.boolean().optional(),
  reason: z.string().trim().max(500).nullable().default(null),
})

export const GET = adminRoute<Context>("customers:read", async ({ context, staff }) => Response.json(await staffCustomers().detail(staff, (await context.params).id)))

export const PATCH = adminRoute<Context>("customers:write", async ({ request, context, staff, meta }) => {
  const { reason, ...changes } = await parseBody(request, update)
  return Response.json({ customer: await staffCustomers().update(staff, meta, (await context.params).id, changes, reason) })
})

/** Erases the customer's personal data (orders keep their amounts); fresh second factor required. */
export const DELETE = adminRoute<Context>({ permission: "customers:delete", stepUp: true }, async ({ request, context, staff, meta }) => {
  const { reason } = await parseBody(request, z.object({ reason: z.string().trim().min(3, "Give a reason").max(500) }))
  await staffCustomers().erase(staff, meta, (await context.params).id, reason)
  return new Response(null, { status: 204 })
})
