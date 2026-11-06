import { z } from "zod"

import { productInput } from "@/features/admin/products/schema"
import { adminRoute } from "@/server/admin/route"
import { staffCatalog } from "@/server/catalog"
import { parseBody } from "@/server/http/route"

type Context = { params: Promise<{ id: string }> }

export const GET = adminRoute<Context>("products:read", async ({ context, staff }) => Response.json(await staffCatalog().getProduct(staff, (await context.params).id)))

/** Saves the product form; `expectedUpdatedAt` refuses a save over someone else's (409). */
export const PUT = adminRoute<Context>("products:write", async ({ request, context, staff, meta }) => {
  const { expectedUpdatedAt, ...input } = await parseBody(request, z.object({ expectedUpdatedAt: z.string().max(40) }).and(productInput))
  const product = await staffCatalog().saveProduct(staff, meta, input, { id: (await context.params).id, expectedUpdatedAt })
  return Response.json({ id: product.id, updatedAt: product.updatedAt })
})

/** Deletes a product that was never ordered; needs a fresh second factor. */
export const DELETE = adminRoute<Context>({ permission: "products:delete", stepUp: true }, async ({ request, context, staff, meta }) => {
  const { reason } = await parseBody(request, z.object({ reason: z.string().trim().min(3, "Give a reason").max(500) }))
  await staffCatalog().deleteProduct(staff, meta, (await context.params).id, reason)
  return new Response(null, { status: 204 })
})
