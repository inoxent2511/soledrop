import { adminService } from "@/server/admin"
import { adminRoute } from "@/server/admin/route"

/** Replaces the member's recovery codes (step-up, checked in the service); the new ones are shown once. */
export const POST = adminRoute("staff", async ({ staff, meta }) => Response.json({ recoveryCodes: await adminService().regenerateRecoveryCodes(staff, meta) }))
