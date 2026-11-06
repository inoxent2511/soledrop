import { adminService } from "@/server/admin"
import { adminRoute } from "@/server/admin/route"

export const GET = adminRoute("staff:read", async ({ staff }) => {
  const service = adminService()
  const [members, invites] = await Promise.all([service.listStaff(staff), service.listInvites(staff)])
  return Response.json({ members, invites })
})
