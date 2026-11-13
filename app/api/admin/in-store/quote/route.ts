import { saleInput } from "@/features/admin/in-store/schema"
import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { quoteInStoreSale } from "@/server/orders/in-store"

export const POST = adminRoute("orders:write", async ({ request, staff }) => {
  const input = await parseBody(request, saleInput)
  return Response.json(await quoteInStoreSale(staff, input))
})
