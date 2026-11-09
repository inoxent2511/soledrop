import "server-only"

import sharp from "sharp"
import { DomainError } from "@/server/shared/errors"
import { IMAGE_WIDTHS, LEGACY_IMAGE_WIDTHS } from "../../lib/image-variants.mjs"

// AVIF tiles depend on concurrency. Four reproduces the frozen optimizer's pixels
// and bounds CPU use on shared hosting; never vary this between upload/backfill.
sharp.concurrency(4)

export { IMAGE_WIDTHS, LEGACY_IMAGE_WIDTHS }
export type ImageFormat = "webp" | "avif"
export type ImageVersion = 1 | 2

export function variantKey(path: string, width: number, format: ImageFormat, version: ImageVersion = 1) {
  if (![1, 2].includes(version) || !(version === 1 ? LEGACY_IMAGE_WIDTHS : IMAGE_WIDTHS).includes(width) || !["webp", "avif"].includes(format)) throw new DomainError("validation", "Invalid image variant.")
  return path + ".v" + version + ".w" + width + "." + format
}

/** Generate once on upload/backfill; HTTP reads never run an image encoder. */
export async function writeImageVariants(path: string, source: Uint8Array, write: (key: string, bytes: Uint8Array) => Promise<unknown>, options: { exists?: (key: string) => Promise<boolean> } = {}) {
  const metadata = await sharp(source, { limitInputPixels: 40_000_000 }).metadata()
  if (!metadata.width || !metadata.height) throw new DomainError("validation", "Invalid image dimensions.")
  const encoded = new Map<string, Buffer>()
  for (const version of [1, 2] as const) for (const width of version === 1 ? LEGACY_IMAGE_WIDTHS : IMAGE_WIDTHS) for (const format of ["webp", "avif"] as const) {
    const key = variantKey(path, width, format, version)
    if (await options.exists?.(key)) continue
    const actualWidth = Math.min(width, metadata.width), identity = version + ":" + actualWidth + ":" + format
    let bytes = encoded.get(identity)
    if (!bytes) {
      const image = sharp(source, { limitInputPixels: 40_000_000 }).rotate().resize({ width: actualWidth, withoutEnlargement: true })
      // v2 matches the frozen Next optimizer's q=75 output at its exact widths.
      bytes = await (format === "avif" ? image.avif(version === 1 ? { quality: 75, effort: 2 } : { quality: 47, effort: 3 }) : image.webp({ quality: version === 1 ? 85 : 75 })).toBuffer()
      encoded.set(identity, bytes)
    }
    await write(key, bytes)
  }
}
