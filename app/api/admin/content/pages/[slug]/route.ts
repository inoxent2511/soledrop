import { z } from "zod"

import { pageInput } from "@/features/admin/content/schema"
import { adminRoute } from "@/server/admin/route"
import { staffContent } from "@/server/content"
import { parseBody } from "@/server/http/route"

type Context = { params: Promise<{ slug: string }> }

export const GET = adminRoute<Context>("content:read", async ({ context, staff }) => Response.json({ page: await staffContent().page(staff, (await context.params).slug) }))

/** Saves the page (its published state is kept); refuses a save over someone else's (409). */
export const PUT = adminRoute<Context>("content:write", async ({ request, context, staff, meta }) => {
  const { expectedUpdatedAt, ...input } = await parseBody(request, z.object({ expectedUpdatedAt: z.string().max(40) }).and(pageInput))
  const page = await staffContent().savePage(staff, meta, input, { previousSlug: (await context.params).slug, expectedUpdatedAt })
  return Response.json({ slug: page.slug, updatedAt: page.updatedAt })
})

export const DELETE = adminRoute<Context>("content:publish", async ({ context, staff, meta }) => {
  await staffContent().deletePage(staff, meta, (await context.params).slug)
  return new Response(null, { status: 204 })
})
