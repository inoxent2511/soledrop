import { codeSchema } from "@/features/admin/auth/schemas"
import { adminService } from "@/server/admin"
import { setStaffCookie, staffToken } from "@/server/admin/dal"
import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"

/** Second sign-in step: TOTP or a recovery code lifts the session to AAL2. */
export const POST = adminRoute("pending", async ({ request, meta }) => {
  const { code } = await parseBody(request, codeSchema)
  const session = await adminService().verifyMfa(await staffToken(), code, meta)
  await setStaffCookie(session.token, session.expiresAt)
  return Response.json({ ok: true })
})
