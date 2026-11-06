import { adminRoute } from "@/server/admin/route"
import { staffShipping } from "@/server/shipping"

export const GET = adminRoute("shipping:read", async ({ staff }) => Response.json(await staffShipping().overview(staff)))
