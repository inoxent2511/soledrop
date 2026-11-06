/** One image in the media library (admin A3). Files are re-encoded to WebP on upload. */
export type MediaItem = {
  id: string
  storeId: string
  /** Storage key: `<store>/<id>.webp`. */
  path: string
  filename: string
  mime: "image/webp" | "image/png" | "image/jpeg" | "image/avif"
  bytes: number
  width: number
  height: number
  alt: string
  createdBy: string | null
  createdAt: string
}

/** The public URL a stored file is served at (app/media/[file]/route.ts). */
export const mediaUrl = (item: Pick<MediaItem, "id">) => `/media/${item.id}.webp`
