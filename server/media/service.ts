import "server-only"

import sharp from "sharp"

import type { RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import type { Permission } from "@/server/admin/permissions"
import type { MediaRepository } from "@/server/media/repository"
import { mediaUrl, type MediaItem } from "@/server/media/types"
import { DomainError } from "@/server/shared/errors"
import { newId, now } from "@/server/shared/ids"

/**
 * Media library (admin A3). Uploads are checked by their bytes, not their name or declared type
 * (JPEG, PNG, WebP or AVIF only, 10 MB at most, 40 megapixels at most), then decoded and
 * re-encoded to WebP at most 2400 px on the long side. Re-encoding drops EXIF/GPS metadata and
 * anything hidden after the image data, so a file that only pretends to be an image never reaches
 * a browser.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const MAX_PIXELS = 40_000_000
const MAX_EDGE = 2400

type Audit = (staff: StaffContext, meta: RequestMeta, entry: { action: string; entity: string; entityId: string; before?: unknown; after?: unknown; reason?: string | null; storeId: string }) => Promise<void>

/** The image format from its magic bytes, or null. */
export function sniffImage(bytes: Uint8Array): "jpeg" | "png" | "webp" | "avif" | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
  if (bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg"
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a) return "png"
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp"
  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "avif"
  return null
}

/** Decodes and re-encodes an upload; throws a validation error for anything that isn't a usable image. */
export async function processImage(bytes: Uint8Array): Promise<{ data: Uint8Array; width: number; height: number }> {
  if (bytes.length === 0) throw new DomainError("validation", "The file is empty.")
  if (bytes.length > MAX_UPLOAD_BYTES) throw new DomainError("validation", "Images can be up to 10 MB.")
  if (!sniffImage(bytes)) throw new DomainError("validation", "Upload a JPEG, PNG, WebP or AVIF image.")
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "error" })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true })
    return { data: new Uint8Array(data), width: info.width, height: info.height }
  } catch {
    throw new DomainError("validation", "That image couldn't be read. Try saving it again as JPEG or PNG.")
  }
}

const need = (staff: StaffContext, permission: Permission) => {
  if (!staff.permissions.includes(permission)) throw new DomainError("forbidden", "You don't have permission to do that.", { permission })
}

export type MediaView = MediaItem & { url: string }
const view = (item: MediaItem): MediaView => ({ ...item, url: mediaUrl(item) })

export function createMediaService(deps: { media: MediaRepository; audit: Audit; usage: (storeId: string, url: string) => Promise<string[]> }) {
  const { media } = deps
  return {
    async list(staff: StaffContext, query: { q?: string; page: number; pageSize: number }) {
      need(staff, "media:read")
      const page = await media.list(staff.member.storeId, query)
      return { items: page.items.map(view), total: page.total }
    },

    async upload(staff: StaffContext, meta: RequestMeta, file: { name: string; bytes: Uint8Array }, alt = "") {
      need(staff, "media:write")
      const image = await processImage(file.bytes)
      const id = newId()
      const filename = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "image"
      const item = await media.create(
        { id, storeId: staff.member.storeId, path: `${staff.member.storeId}/${id}.webp`, filename, mime: "image/webp", bytes: image.data.length, width: image.width, height: image.height, alt: alt.trim().slice(0, 300), createdBy: staff.member.userId, createdAt: now() },
        image.data,
      )
      await deps.audit(staff, meta, { action: "media.uploaded", entity: "media", entityId: id, after: { filename, bytes: item.bytes, width: item.width, height: item.height }, storeId: staff.member.storeId })
      return view(item)
    },

    async setAlt(staff: StaffContext, meta: RequestMeta, id: string, alt: string) {
      need(staff, "media:write")
      const before = await media.find(staff.member.storeId, id)
      if (!before) throw new DomainError("not_found", "Image not found.")
      const item = await media.updateAlt(staff.member.storeId, id, alt.trim().slice(0, 300))
      await deps.audit(staff, meta, { action: "media.alt_changed", entity: "media", entityId: id, before: { alt: before.alt }, after: { alt: item.alt }, storeId: staff.member.storeId })
      return view(item)
    },

    /** Where an image is used (product slugs); deleting a used image is refused. */
    async usage(staff: StaffContext, id: string) {
      need(staff, "media:read")
      const item = await media.find(staff.member.storeId, id)
      if (!item) throw new DomainError("not_found", "Image not found.")
      return deps.usage(staff.member.storeId, mediaUrl(item))
    },

    async remove(staff: StaffContext, meta: RequestMeta, id: string) {
      need(staff, "media:write")
      const item = await media.find(staff.member.storeId, id)
      if (!item) throw new DomainError("not_found", "Image not found.")
      const usedBy = await deps.usage(staff.member.storeId, mediaUrl(item))
      if (usedBy.length) throw new DomainError("conflict", `This image is used by ${usedBy.length} product${usedBy.length === 1 ? "" : "s"}. Remove it there first.`, { usedBy })
      await media.remove(staff.member.storeId, id)
      await deps.audit(staff, meta, { action: "media.deleted", entity: "media", entityId: id, before: { filename: item.filename }, storeId: staff.member.storeId })
    },

    /** Public file read for app/media/[file]: the stored WebP, or null. */
    async file(id: string) {
      const item = await media.findById(id)
      if (!item) return null
      const data = await media.read(item.path)
      return data ? { item, data } : null
    },
  }
}

export type MediaService = ReturnType<typeof createMediaService>
