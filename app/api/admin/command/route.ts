import { adminRoute } from "@/server/admin/route"
import { insights } from "@/server/reports"

/** The command palette's search: pages, orders, products and customers the member may see. */
export const GET = adminRoute("staff", async ({ request, staff }) => {
  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 80)
  return Response.json({ results: await insights().command(staff, q) })
})
