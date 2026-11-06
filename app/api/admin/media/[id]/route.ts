import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { mediaService } from "@/server/media"
import { parseBody } from "@/server/http/route"

type Context = { params: Promise<{ id: string }> }

/** Which products use this image. */
export const GET = adminRoute<Context>("media:read", async ({ context, staff }) => Response.json({ usedBy: await mediaService().usage(staff, (await context.params).id) }))

export const PATCH = adminRoute<Context>("media:write", async ({ request, context, staff, meta }) => {
  const { alt } = await parseBody(request, z.object({ alt: z.string().max(300) }))
  return Response.json({ item: await mediaService().setAlt(staff, meta, (await context.params).id, alt) })
})

/** Deletes an image no product uses. */
export const DELETE = adminRoute<Context>("media:write", async ({ context, staff, meta }) => {
  await mediaService().remove(staff, meta, (await context.params).id)
  return new Response(null, { status: 204 })
})
