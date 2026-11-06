import { zoneInput } from "@/features/admin/shipping/schema"
import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { staffShipping } from "@/server/shipping"

type Context = { params: Promise<{ id: string }> }

export const PUT = adminRoute<Context>("shipping:write", async ({ request, context, staff, meta }) => {
  const zone = await staffShipping().saveZone(staff, meta, await parseBody(request, zoneInput), (await context.params).id)
  return Response.json({ id: zone.id })
})

export const DELETE = adminRoute<Context>("shipping:write", async ({ context, staff, meta }) => {
  await staffShipping().deleteZone(staff, meta, (await context.params).id)
  return new Response(null, { status: 204 })
})
