import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { staffCustomers } from "@/server/customers"
import { parseBody } from "@/server/http/route"

type Context = { params: Promise<{ id: string }> }

/** A data-access export on the customer's behalf (JSON download); step-up and a reason required. */
export const POST = adminRoute<Context>({ permission: "customers:export", stepUp: true }, async ({ request, context, staff, meta }) => {
  const { reason } = await parseBody(request, z.object({ reason: z.string().trim().min(3, "Give a reason").max(500) }))
  const { id } = await context.params
  const data = await staffCustomers().exportData(staff, meta, id, reason)
  return new Response(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="customer-${id}.json"` } })
})
