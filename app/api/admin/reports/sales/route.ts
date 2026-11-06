import { reportRange } from "@/features/admin/reports/range"
import { adminRoute } from "@/server/admin/route"
import { reports } from "@/server/reports"

/** Sales by day and their breakdowns for `?from=YYYY-MM-DD&to=YYYY-MM-DD` (Pakistan days). */
export const GET = adminRoute("reports:read", async ({ request, staff }) => {
  const { from, to } = reportRange(Object.fromEntries(new URL(request.url).searchParams))
  return Response.json(await reports().sales(staff, from, to))
})
