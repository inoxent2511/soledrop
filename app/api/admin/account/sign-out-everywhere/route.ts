import { adminService } from "@/server/admin"
import { clearStaffCookie } from "@/server/admin/dal"
import { adminRoute } from "@/server/admin/route"

/** Ends every session of the signed-in member, this one included. */
export const POST = adminRoute("staff", async ({ staff, meta }) => {
  await adminService().signOutEverywhere(staff, meta)
  await clearStaffCookie()
  return new Response(null, { status: 204 })
})
