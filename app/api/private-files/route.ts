import { serverEnv } from "@/lib/env.server"
import { storage } from "@/server/adapters/storage"
import { privateFileKey } from "@/server/adapters/storage/private-files"
import { route } from "@/server/http/route"

export const GET = route(async (request) => {
  const key = privateFileKey(new URL(request.url).searchParams.get("token") ?? "", serverEnv.STORE_ID, serverEnv.SESSION_SECRET)
  const object = await storage().get(key)
  if (!object) return new Response("Not found", { status: 404 })
  return new Response(Buffer.from(object.data), { headers: { "content-type": "application/octet-stream", "content-disposition": 'attachment; filename="download.bin"', "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" } })
})
