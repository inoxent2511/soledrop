import { z } from "zod"

import { adminService } from "@/server/admin"
import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"

type Context = { params: Promise<{ userId: string }> }

export const GET = adminRoute<Context>("staff:read", async ({ context, staff }) => {
  const { userId } = await context.params
  const service = adminService()
  const [member, sessions] = await Promise.all([service.getStaff(staff, userId), service.listSessions(staff, userId)])
  return Response.json({ member, sessions })
})

const change = z.discriminatedUnion("action", [
  z.object({ action: z.literal("roles"), roleKeys: z.array(z.string().min(2).max(40)).min(1).max(10), reason: z.string().trim().max(500).nullable().default(null) }),
  z.object({ action: z.literal("status"), status: z.enum(["active", "suspended"]), reason: z.string().trim().max(500).nullable().default(null) }),
  z.object({ action: z.literal("reset_mfa"), reason: z.string().trim().max(500).nullable().default(null) }),
])

/** Change roles, suspend or reactivate, or reset MFA; each ends the member's sessions. */
export const PATCH = adminRoute<Context>({ permission: "staff:manage", stepUp: true }, async ({ request, context, staff, meta }) => {
  const { userId } = await context.params
  const input = await parseBody(request, change)
  const service = adminService()
  if (input.action === "roles") await service.setStaffRoles(staff, userId, input.roleKeys, meta, input.reason)
  if (input.action === "status") await service.setStaffStatus(staff, userId, input.status, meta, input.reason)
  if (input.action === "reset_mfa") await service.resetMfa(staff, userId, meta, input.reason)
  return Response.json({ member: await service.getStaff(staff, userId) })
})
