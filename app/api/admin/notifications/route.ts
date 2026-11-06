import { adminRoute } from "@/server/admin/route"
import { insights } from "@/server/reports"

/** What needs attention, limited to what the member can act on. */
export const GET = adminRoute("staff", async ({ staff }) => Response.json({ items: await insights().attention(staff) }))
