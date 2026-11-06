import { taxTableInput } from "@/features/admin/shipping/schema"
import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { staffShipping } from "@/server/shipping"

/** Replaces the tax table. */
export const PUT = adminRoute("shipping:write", async ({ request, staff, meta }) => {
  const { rates } = await parseBody(request, taxTableInput)
  return Response.json({ rates: await staffShipping().saveTaxRates(staff, meta, rates) })
})
