import { acceptInviteSchema } from "@/features/admin/auth/schemas"
import { adminService } from "@/server/admin"
import { setStaffCookie } from "@/server/admin/dal"
import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"

/** Accepts an invite: creates the account, then the person enrols MFA. */
export const POST = adminRoute<{ params: Promise<{ token: string }> }>("public", async ({ request, context, meta }) => {
  const { token } = await context.params
  const input = await parseBody(request, acceptInviteSchema)
  const session = await adminService().acceptInvite(token, input, meta)
  await setStaffCookie(session.token, session.expiresAt)
  return Response.json({ needs: session.needs })
})
