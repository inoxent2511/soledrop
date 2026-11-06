import { adminService } from "@/server/admin"
import { adminRoute } from "@/server/admin/route"

type Context = { params: Promise<{ id: string }> }

export const DELETE = adminRoute<Context>("staff:manage", async ({ context, staff, meta }) => {
  await adminService().revokeInvite(staff, (await context.params).id, meta)
  return new Response(null, { status: 204 })
})
