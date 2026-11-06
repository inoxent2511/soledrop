import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { staffPromotions } from "@/server/promotions"

type Context = { params: Promise<{ id: string }> }

export const POST = adminRoute<Context>("promotions:write", async ({ request, context, staff, meta }) => {
  const { active } = await parseBody(request, z.object({ active: z.boolean() }))
  const promotion = await staffPromotions().setActive(staff, meta, (await context.params).id, active)
  return Response.json({ active: promotion.active })
})
