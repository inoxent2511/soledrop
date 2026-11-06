import { collectionInput } from "@/features/admin/collections/schema"
import { adminRoute } from "@/server/admin/route"
import { staffCatalog } from "@/server/catalog"
import { parseBody } from "@/server/http/route"

export const GET = adminRoute("collections:read", async ({ staff }) => Response.json({ collections: await staffCatalog().collections(staff) }))

export const POST = adminRoute("collections:write", async ({ request, staff, meta }) => {
  const input = await parseBody(request, collectionInput)
  const collection = await staffCatalog().saveCollection(staff, meta, input)
  return Response.json({ id: collection.id }, { status: 201 })
})
