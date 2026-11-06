import { parseOrderParams, toOrderQuery } from "@/features/admin/orders/query"
import { adminRoute } from "@/server/admin/route"
import { staffOrders } from "@/server/orders"

/** CSV of the orders matching the current filters (formula-safe, audited). */
export const GET = adminRoute("orders:export", async ({ request, staff, meta }) => {
  const { page: _page, pageSize: _size, ...query } = toOrderQuery(parseOrderParams(new URL(request.url).searchParams))
  const csv = await staffOrders().exportCsv(staff, meta, query)
  const stamp = new Date().toISOString().slice(0, 10)
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="orders-${stamp}.csv"` } })
})
