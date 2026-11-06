import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { staffCatalog } from "@/server/catalog"
import { parseBody } from "@/server/http/route"

export const GET = adminRoute("products:read", async ({ staff }) => Response.json({ brands: await staffCatalog().brands(staff) }))

export const POST = adminRoute("products:write", async ({ request, staff, meta }) => {
  const { name } = await parseBody(request, z.object({ name: z.string().trim().min(2, "Give the brand a name").max(60) }))
  return Response.json({ brand: await staffCatalog().createBrand(staff, meta, name) }, { status: 201 })
})
