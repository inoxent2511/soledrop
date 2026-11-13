import { adminRoute } from "@/server/admin/route"
import { searchInStoreProducts } from "@/server/orders/in-store"

export const GET = adminRoute("orders:write", async ({ request, staff }) => {
  const params = new URL(request.url).searchParams
  const kind = params.get("kind")
  const products = await searchInStoreProducts(staff, params.get("q") ?? "", kind === "new" || kind === "preloved" ? kind : undefined)
  return Response.json({ products })
})
