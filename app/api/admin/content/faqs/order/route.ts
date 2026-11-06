import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { staffContent } from "@/server/content"
import { parseBody } from "@/server/http/route"

/** Sets the FAQ order (every question's id, in order). */
export const PUT = adminRoute("content:publish", async ({ request, staff, meta }) => {
  const { ids } = await parseBody(request, z.object({ ids: z.array(z.uuid()).max(500) }))
  await staffContent().reorderFaqs(staff, meta, ids)
  return new Response(null, { status: 204 })
})
