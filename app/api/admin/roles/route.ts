import { z } from "zod"

import { adminService } from "@/server/admin"
import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"

const roleBody = z.object({
  name: z.string().trim().min(2, "Name the role").max(60),
  description: z.string().trim().max(200).default(""),
  refundLimit: z.number().int().min(0).max(100_000_000_00).nullable(),
  permissions: z.array(z.string().max(40)).max(100),
})

export const GET = adminRoute("staff:read", async ({ staff }) => Response.json({ roles: await adminService().listRoles(staff) }))

export const POST = adminRoute({ permission: "roles:manage", stepUp: true }, async ({ request, staff, meta }) => {
  const role = await adminService().saveRole(staff, await parseBody(request, roleBody), meta)
  return Response.json({ role }, { status: 201 })
})
