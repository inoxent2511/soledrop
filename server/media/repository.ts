import type { MediaItem } from "@/server/media/types"

/** The media library: an index row per file plus the file in object storage. */
export interface MediaRepository {
  list(storeId: string, query: { q?: string; page: number; pageSize: number }): Promise<{ items: MediaItem[]; total: number }>
  find(storeId: string, id: string): Promise<MediaItem | null>
  /** Any store (the public file route looks a file up by id alone). */
  findById(id: string): Promise<MediaItem | null>
  create(item: MediaItem, data: Uint8Array): Promise<MediaItem>
  updateAlt(storeId: string, id: string, alt: string): Promise<MediaItem>
  remove(storeId: string, id: string): Promise<void>
  read(path: string): Promise<Uint8Array | null>
}
