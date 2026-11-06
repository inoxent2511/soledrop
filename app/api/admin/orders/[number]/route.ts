import { adminRoute } from "@/server/admin/route"
import { staffOrders } from "@/server/orders"

type Context = { params: Promise<{ number: string }> }

/** One order with its payments, refunds, returns, notes and the actions this member may take. */
export const GET = adminRoute<Context>("orders:read", async ({ context, staff }) => Response.json(await staffOrders().detail(staff, (await context.params).number)))
