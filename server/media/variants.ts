import "server-only"

import sharp from "sharp"
import { DomainError } from "@/server/shared/errors"

export const IMAGE_WIDTHS = [320, 640, 960, 1280, 1920, 2400] as const
export type ImageFormat = "webp" | "avif"

export function variantKey(path: string, width: number, format: ImageFormat) {
  if (!(IMAGE_WIDTHS as readonly number[]).includes(width) || !["webp", "avif"].includes(format)) throw new DomainError("validation", "Invalid image variant.")
  return path + ".v1.w" + width + "." + format
}

/** Generate once on upload/backfill; HTTP reads never run an image encoder. */
export async function writeImageVariants(path: string, source: Uint8Array, write: (key: string, bytes: Uint8Array) => Promise<unknown>) {
  const metadata = await sharp(source, { limitInputPixels: 40_000_000 }).metadata()
  if (!metadata.width || !metadata.height) throw new DomainError("validation", "Invalid image dimensions.")
  const encoded = new Map<string, Buffer>()
  for (const width of IMAGE_WIDTHS) for (const format of ["webp", "avif"] as const) {
    const actualWidth = Math.min(width, metadata.width), identity = actualWidth + ":" + format
    let bytes = encoded.get(identity)
    if (!bytes) {
      const image = sharp(source, { limitInputPixels: 40_000_000 }).rotate().resize({ width: actualWidth, withoutEnlargement: true })
      bytes = await (format === "avif" ? image.avif({ quality: 75, effort: 2 }) : image.webp({ quality: 85 })).toBuffer()
      encoded.set(identity, bytes)
    }
    await write(variantKey(path, width, format), bytes)
  }
}
