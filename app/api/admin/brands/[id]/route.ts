import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { staffCatalog } from "@/server/catalog"
import { parseBody } from "@/server/http/route"

type Context = { params: Promise<{ id: string }> }

export const DELETE = adminRoute<Context>("products:write", async ({ request, context, staff, meta }) => {
  const { id } = await context.params
  const { reason } = await parseBody(request, z.object({ reason: z.string().trim().max(500).nullable().default(null) }))
  await staffCatalog().deleteBrand(staff, meta, id, reason)
  return new Response(null, { status: 204 })
})
