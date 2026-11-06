import { adminService } from "@/server/admin"
import { clearStaffCookie, staffToken } from "@/server/admin/dal"
import { adminRoute } from "@/server/admin/route"

/** Public so an expired session can still clear its cookie; it only ever ends the caller's own session. */
export const POST = adminRoute("public", async () => {
  await adminService().logout(await staffToken())
  await clearStaffCookie()
  return new Response(null, { status: 204 })
})
