import { adminRoute } from "@/server/admin/route"
import { reports } from "@/server/reports"

export const GET = adminRoute("reports:read", async ({ staff }) => Response.json(await reports().inventoryValue(staff)))
