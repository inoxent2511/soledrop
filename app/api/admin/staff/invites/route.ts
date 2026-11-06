import { z } from "zod"

import { adminService } from "@/server/admin"
import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"

/** Invites a new staff member; the link is shown once (no email provider sends it yet). */
export const POST = adminRoute({ permission: "staff:manage", stepUp: true }, async ({ request, staff, meta }) => {
  const input = await parseBody(request, z.object({ email: z.email("Enter their email").max(200), roleKey: z.string().min(2).max(40) }))
  return Response.json(await adminService().invite(staff, input, meta), { status: 201 })
})
