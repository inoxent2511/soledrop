import { promotionInput } from "@/features/admin/promotions/schema"
import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { staffPromotions } from "@/server/promotions"

type Context = { params: Promise<{ id: string }> }

export const GET = adminRoute<Context>("promotions:read", async ({ context, staff }) => Response.json(await staffPromotions().detail(staff, (await context.params).id)))

export const PUT = adminRoute<Context>("promotions:write", async ({ request, context, staff, meta }) => {
  const input = await parseBody(request, promotionInput)
  const promotion = await staffPromotions().save(staff, meta, input, (await context.params).id)
  return Response.json({ id: promotion.id })
})

/** Deletes a promotion nobody used; a used one can only be switched off. */
export const DELETE = adminRoute<Context>("promotions:write", async ({ context, staff, meta }) => {
  await staffPromotions().remove(staff, meta, (await context.params).id)
  return new Response(null, { status: 204 })
})
