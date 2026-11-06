import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { mediaService } from "@/server/media"
import { MAX_UPLOAD_BYTES } from "@/server/media/service"
import { DomainError } from "@/server/shared/errors"

const query = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  size: z.coerce.number().int().min(1).max(100).catch(40),
})

export const GET = adminRoute("media:read", async ({ request, staff }) => {
  const params = query.parse(Object.fromEntries(new URL(request.url).searchParams))
  return Response.json(await mediaService().list(staff, { q: params.q, page: params.page, pageSize: params.size }))
})

/** Uploads one image (multipart field `file`, optional `alt`); it is checked and re-encoded to WebP. */
export const POST = adminRoute("media:write", async ({ request, staff, meta }) => {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) throw new DomainError("validation", "Images can be up to 10 MB.")
  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) throw new DomainError("validation", "Choose an image to upload.")
  if (file.size > MAX_UPLOAD_BYTES) throw new DomainError("validation", "Images can be up to 10 MB.")
  const alt = String(form?.get("alt") ?? "")
  const item = await mediaService().upload(staff, meta, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, alt)
  return Response.json({ item }, { status: 201 })
})
