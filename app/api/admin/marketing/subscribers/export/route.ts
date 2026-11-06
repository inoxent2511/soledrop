import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { staffMarketing } from "@/server/reports"

/** Subscribed addresses as CSV; fresh second factor and a reason required (A-003). */
export const POST = adminRoute({ permission: "marketing:export", stepUp: true }, async ({ request, staff, meta }) => {
  const { reason } = await parseBody(request, z.object({ reason: z.string().trim().min(3, "Give a reason").max(500) }))
  const csv = await staffMarketing().exportSubscribers(staff, meta, reason)
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="newsletter-${new Date().toISOString().slice(0, 10)}.csv"` } })
})
