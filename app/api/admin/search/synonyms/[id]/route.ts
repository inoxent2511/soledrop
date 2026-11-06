import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { staffSearch } from "@/server/reports"

type Context = { params: Promise<{ id: string }> }

const synonymInput = z.object({ term: z.string().trim().min(1).max(60), synonyms: z.array(z.string().trim().min(1).max(60)).min(1).max(20) })

export const PUT = adminRoute<Context>("search:write", async ({ request, context, staff, meta }) =>
  Response.json({ synonym: await staffSearch().saveSynonym(staff, meta, await parseBody(request, synonymInput), (await context.params).id) }),
)

export const DELETE = adminRoute<Context>("search:write", async ({ context, staff, meta }) => {
  await staffSearch().deleteSynonym(staff, meta, (await context.params).id)
  return new Response(null, { status: 204 })
})
