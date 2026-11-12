import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { moderateReview } from "@/server/reviews"

type Context = { params: Promise<{ id: string }> }
const actionSchema = z.object({ action: z.enum(["approve", "reject", "feature", "unfeature"]) })

export const PATCH = adminRoute<Context>("reviews:write", async ({ request, context, staff, meta }) => {
  const { id } = await context.params
  if (!z.uuid().safeParse(id).success) return Response.json({ error: { code: "validation", message: "Invalid review." } }, { status: 422 })
  const { action } = await parseBody(request, actionSchema)
  await moderateReview(staff, meta, id, action)
  return Response.json({ ok: true })
})
