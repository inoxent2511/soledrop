import { mediaService } from "@/server/media"

type Context = { params: Promise<{ file: string }> }

/**
 * Serves media library images (`/media/<id>.webp`). Public, because product photos are public;
 * the ids are random UUIDs. Files are immutable (a new upload gets a new id), so they cache for
 * a year. nosniff and a sandboxing CSP stop a browser treating the bytes as anything but an image.
 */
export async function GET(_request: Request, { params }: Context) {
  const { file } = await params
  const match = /^([0-9a-f-]{36})\.webp$/.exec(file)
  const found = match ? await mediaService().file(match[1]) : null
  if (!found) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } })
  return new Response(Buffer.from(found.data), {
    headers: {
      "content-type": "image/webp",
      "content-length": String(found.data.length),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": `inline; filename="${found.item.id}.webp"`,
    },
  })
}
