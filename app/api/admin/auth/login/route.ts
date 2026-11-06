import { staffLoginSchema } from "@/features/admin/auth/schemas"
import { adminService } from "@/server/admin"
import { setStaffCookie } from "@/server/admin/dal"
import { adminRoute } from "@/server/admin/route"
import { currentStoreId } from "@/server/db/driver"
import { parseBody } from "@/server/http/route"

/** Password step; the session is AAL1 until the second factor (A-001, A-002, A-005). */
export const POST = adminRoute("public", async ({ request, meta }) => {
  const input = await parseBody(request, staffLoginSchema)
  const session = await adminService().login(currentStoreId(), input.email, input.password, meta)
  await setStaffCookie(session.token, session.expiresAt)
  return Response.json({ needs: session.needs })
})
