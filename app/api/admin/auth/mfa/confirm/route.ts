import { codeSchema } from "@/features/admin/auth/schemas"
import { adminService } from "@/server/admin"
import { setStaffCookie, staffToken } from "@/server/admin/dal"
import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"

/** Confirms enrolment; the recovery codes are shown once and never again. */
export const POST = adminRoute("pending", async ({ request, meta }) => {
  const { code } = await parseBody(request, codeSchema)
  const { session, recoveryCodes } = await adminService().confirmEnrolment(await staffToken(), code, meta)
  await setStaffCookie(session.token, session.expiresAt)
  return Response.json({ recoveryCodes })
})
