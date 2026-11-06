import { z } from "zod"

import { staffPasswordSchema } from "@/features/admin/auth/schemas"
import { adminService } from "@/server/admin"
import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"

/** Changes the member's password and ends their other sessions. */
export const POST = adminRoute("staff", async ({ request, staff, meta }) => {
  const input = await parseBody(request, z.object({ currentPassword: z.string().min(1).max(200), newPassword: staffPasswordSchema }))
  await adminService().changePassword(staff, input.currentPassword, input.newPassword, meta)
  return Response.json({ ok: true })
})
