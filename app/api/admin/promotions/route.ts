import { promotionInput } from "@/features/admin/promotions/schema"
import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { staffPromotions } from "@/server/promotions"

export const GET = adminRoute("promotions:read", async ({ staff }) => Response.json({ promotions: await staffPromotions().list(staff) }))

export const POST = adminRoute("promotions:write", async ({ request, staff, meta }) => {
  const input = await parseBody(request, promotionInput)
  const promotion = await staffPromotions().save(staff, meta, input)
  return Response.json({ id: promotion.id }, { status: 201 })
})
