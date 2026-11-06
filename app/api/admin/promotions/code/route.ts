import { adminRoute } from "@/server/admin/route"
import { staffPromotions } from "@/server/promotions"

/** A fresh, easy-to-read code (SD-XXXX-XXXX); uniqueness is checked again on save. */
export const GET = adminRoute("promotions:write", async () => Response.json({ code: staffPromotions().generateCode() }))
