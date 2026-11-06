import { zoneInput } from "@/features/admin/shipping/schema"
import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { staffShipping } from "@/server/shipping"

export const POST = adminRoute("shipping:write", async ({ request, staff, meta }) => {
  const zone = await staffShipping().saveZone(staff, meta, await parseBody(request, zoneInput))
  return Response.json({ id: zone.id }, { status: 201 })
})
