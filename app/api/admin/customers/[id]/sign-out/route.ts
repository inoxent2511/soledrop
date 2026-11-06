import { adminRoute } from "@/server/admin/route"
import { staffCustomers } from "@/server/customers"

type Context = { params: Promise<{ id: string }> }

/** Ends the customer's sessions on every device. */
export const POST = adminRoute<Context>("customers:write", async ({ context, staff, meta }) => {
  await staffCustomers().signOut(staff, meta, (await context.params).id)
  return new Response(null, { status: 204 })
})
