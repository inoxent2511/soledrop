import { z } from "zod"

import { adminService } from "@/server/admin"
import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"

/** The signed-in member's live sessions (device, IP, last seen), A-004. */
export const GET = adminRoute("staff", async ({ staff }) => Response.json({ sessions: await adminService().listSessions(staff) }))

/** Ends one of their own sessions (another member's needs staff:manage and step-up, checked in the service). */
export const DELETE = adminRoute("staff", async ({ request, staff, meta }) => {
  const { sessionId } = await parseBody(request, z.object({ sessionId: z.uuid() }))
  await adminService().revokeSession(staff, sessionId, meta)
  return new Response(null, { status: 204 })
})
