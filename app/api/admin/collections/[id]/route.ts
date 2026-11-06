import { z } from "zod"

import { collectionInput } from "@/features/admin/collections/schema"
import { adminRoute } from "@/server/admin/route"
import { staffCatalog } from "@/server/catalog"
import { parseBody } from "@/server/http/route"

type Context = { params: Promise<{ id: string }> }

export const GET = adminRoute<Context>("collections:read", async ({ context, staff }) => Response.json(await staffCatalog().collection(staff, (await context.params).id)))

export const PUT = adminRoute<Context>("collections:write", async ({ request, context, staff, meta }) => {
  const input = await parseBody(request, collectionInput)
  const collection = await staffCatalog().saveCollection(staff, meta, { ...input, id: (await context.params).id })
  return Response.json({ id: collection.id })
})

export const DELETE = adminRoute<Context>("collections:write", async ({ request, context, staff, meta }) => {
  const { reason } = await parseBody(request, z.object({ reason: z.string().trim().max(500).nullable().default(null) }))
  await staffCatalog().deleteCollection(staff, meta, (await context.params).id, reason)
  return new Response(null, { status: 204 })
})
