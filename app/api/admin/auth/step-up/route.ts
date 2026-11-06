import { codeSchema } from "@/features/admin/auth/schemas"
import { adminService } from "@/server/admin"
import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"

/** Re-proves the second factor before a sensitive action (A-003). */
export const POST = adminRoute("staff", async ({ request, staff, meta }) => {
  const { code } = await parseBody(request, codeSchema)
  await adminService().stepUp(staff, code, meta)
  return Response.json({ ok: true })
})
