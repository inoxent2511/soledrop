import { reportRange } from "@/features/admin/reports/range"
import { adminRoute } from "@/server/admin/route"
import { reports } from "@/server/reports"

export const GET = adminRoute("reports:export", async ({ request, staff, meta }) => {
  const { from, to } = reportRange(Object.fromEntries(new URL(request.url).searchParams))
  const csv = await reports().exportSales(staff, meta, from, to)
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="sales-${from}-to-${to}.csv"` } })
})
