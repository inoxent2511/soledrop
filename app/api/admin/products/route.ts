import { z } from "zod"

import { productInput } from "@/features/admin/products/schema"
import { adminRoute } from "@/server/admin/route"
import { staffCatalog } from "@/server/catalog"
import { parseBody } from "@/server/http/route"

const listQuery = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  status: z.enum(["draft", "active", "archived"]).optional().catch(undefined),
  kind: z.enum(["new", "preloved"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  size: z.coerce.number().int().min(1).max(100).catch(25),
})

/** Staff product search (every status). */
export const GET = adminRoute("products:read", async ({ request, staff }) => {
  const query = listQuery.parse(Object.fromEntries(new URL(request.url).searchParams))
  return Response.json(await staffCatalog().listProducts(staff, { q: query.q, status: query.status ? [query.status] : undefined, kind: query.kind, page: query.page, pageSize: query.size }))
})

/** Creates a draft product. */
export const POST = adminRoute("products:write", async ({ request, staff, meta }) => {
  const input = await parseBody(request, productInput)
  const product = await staffCatalog().saveProduct(staff, meta, input, {})
  return Response.json({ id: product.id, updatedAt: product.updatedAt }, { status: 201 })
})
