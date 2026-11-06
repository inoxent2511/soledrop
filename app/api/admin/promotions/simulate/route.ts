import { z } from "zod"

import { promotionInput, simulationInput } from "@/features/admin/promotions/schema"
import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { staffPromotions } from "@/server/promotions"

/** Runs the promotion in the form against a test basket with the checkout engine; writes nothing. */
export const POST = adminRoute("promotions:read", async ({ request, staff }) => {
  const { promotion, basket } = await parseBody(request, z.object({ promotion: promotionInput, basket: simulationInput }))
  return Response.json(staffPromotions().simulate(staff, promotion, basket))
})
