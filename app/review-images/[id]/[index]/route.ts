import { createHash } from "node:crypto"

import { route } from "@/server/http/route"
import { approvedReviewImage } from "@/server/reviews"

type Context = { params: Promise<{ id: string; index: string }> }

export const GET = route<Context>(async (request, { params }) => {
  const { id, index } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !/^[0-2]$/.test(index)) return new Response("Not found", { status: 404 })
  const bytes = await approvedReviewImage(id, Number(index))
  if (!bytes) return new Response("Not found", { status: 404 })
  const etag = `"${createHash("sha256").update(bytes).digest("hex")}"`
  const headers = { "content-type": "image/webp", "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox", etag }
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers })
  return new Response(Buffer.from(bytes), { headers })
})
