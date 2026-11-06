import { parseOrderParams, toOrderQuery } from "@/features/admin/orders/query"
import { adminRoute } from "@/server/admin/route"
import { staffOrders } from "@/server/orders"

/** Staff order search: the same filters as the orders page (`?q=&view=&status=&payment=&from=&to=&sort=&page=&size=`). */
export const GET = adminRoute("orders:read", async ({ request, staff }) => {
  const params = parseOrderParams(new URL(request.url).searchParams)
  return Response.json(await staffOrders().list(staff, toOrderQuery(params)))
})
