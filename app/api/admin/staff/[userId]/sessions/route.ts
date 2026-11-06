import { z } from "zod"

import { adminService } from "@/server/admin"
import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"

/** Ends one of another member's sessions (staff:manage and step-up, checked in the service). */
export const DELETE = adminRoute({ permission: "staff:manage", stepUp: true }, async ({ request, staff, meta }) => {
  const { sessionId } = await parseBody(request, z.object({ sessionId: z.uuid() }))
  await adminService().revokeSession(staff, sessionId, meta)
  return new Response(null, { status: 204 })
})
