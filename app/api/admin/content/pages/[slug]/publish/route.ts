import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { staffContent } from "@/server/content"
import { parseBody } from "@/server/http/route"

type Context = { params: Promise<{ slug: string }> }

export const POST = adminRoute<Context>("content:publish", async ({ request, context, staff, meta }) => {
  const { published } = await parseBody(request, z.object({ published: z.boolean() }))
  const page = await staffContent().setPublished(staff, meta, (await context.params).slug, published)
  return Response.json({ published: page.published, updatedAt: page.updatedAt })
})
