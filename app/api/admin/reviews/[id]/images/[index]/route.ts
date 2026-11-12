import { adminRoute } from "@/server/admin/route"
import { staffReviewImage } from "@/server/reviews"

type Context = { params: Promise<{ id: string; index: string }> }

export const GET = adminRoute<Context>("reviews:read", async ({ context, staff }) => {
  const { id, index } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !/^[0-2]$/.test(index)) return new Response("Not found", { status: 404 })
  const bytes = await staffReviewImage(staff.member.storeId, id, Number(index))
  if (!bytes) return new Response("Not found", { status: 404 })
  return new Response(Buffer.from(bytes), { headers: { "content-type": "image/webp", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" } })
})
