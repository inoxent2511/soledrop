import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { staffCatalog } from "@/server/catalog"
import { parseBody } from "@/server/http/route"

type Context = { params: Promise<{ id: string }> }

/** Publish (active), unpublish (draft) or archive. */
export const POST = adminRoute<Context>("products:publish", async ({ request, context, staff, meta }) => {
  const input = await parseBody(request, z.object({ status: z.enum(["draft", "active", "archived"]), expectedUpdatedAt: z.string().max(40).optional() }))
  const product = await staffCatalog().setStatus(staff, meta, (await context.params).id, input.status, input.expectedUpdatedAt)
  return Response.json({ status: product.status, updatedAt: product.updatedAt })
})
