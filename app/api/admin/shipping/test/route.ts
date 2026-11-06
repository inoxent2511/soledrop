import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { staffShipping } from "@/server/shipping"

/** The rate tester: what a shopper in this city sees for this subtotal. */
export const POST = adminRoute("shipping:read", async ({ request, staff }) => {
  const input = await parseBody(request, z.object({ country: z.string().regex(/^[A-Z]{2}$/).default("PK"), city: z.string().trim().max(60), province: z.string().trim().max(60).optional(), subtotal: z.number().int().min(0) }))
  return Response.json(await staffShipping().test(staff, input))
})
