import { mediaService } from "@/server/media"
import { route } from "@/server/http/route"
import { IMAGE_WIDTHS } from "@/server/media/variants"
import { createHash } from "node:crypto"

type Context = { params: Promise<{ file: string }> }

/**
 * Serves media library images (`/media/<id>.webp`). Public, because product photos are public;
 * the ids are random UUIDs. Files are immutable (a new upload gets a new id), so they cache for
 * a year. nosniff and a sandboxing CSP stop a browser treating the bytes as anything but an image.
 */
export const GET = route<Context>(async (request, { params }) => {
  const { file } = await params
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.webp$/.exec(file)
  const requested = new URL(request.url).searchParams.get("w"), width = requested === null ? null : Number(requested)
  if (width !== null && (!(IMAGE_WIDTHS as readonly number[]).includes(width) || String(width) !== requested)) return new Response("Invalid image width", { status: 400, headers: { "cache-control": "no-store" } })
  const avif = request.headers.get("accept")?.split(",").some((entry) => { const [type, ...options] = entry.trim().split(";"); return type === "image/avif" && !options.some((option) => /^\s*q\s*=\s*0(?:\.0*)?\s*$/.test(option)) })
  const found = match ? await mediaService().file(match[1], width ? { width, format: avif ? "avif" : "webp" } : undefined) : null
  if (!found) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } })
  const etag = '"' + createHash("sha256").update(found.data).digest("hex") + '"'
  const cache = { etag, vary: "Accept", "cache-control": "public, max-age=31536000, immutable" }
  if (request.headers.get("if-none-match")?.split(",").some((value) => value.trim().replace(/^W\//, "") === etag || value.trim() === "*")) return new Response(null, { status: 304, headers: cache })
  return new Response(Buffer.from(found.data), {
    headers: {
      ...cache,
      "content-type": found.mime,
      "content-length": String(found.data.length),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": `inline; filename="${found.item.id}.${found.mime === "image/avif" ? "avif" : "webp"}"`,
    },
  })
})
