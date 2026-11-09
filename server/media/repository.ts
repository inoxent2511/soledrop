import type { ActorScoped } from "@/server/db/actor"
import type { MediaItem } from "@/server/media/types"
import type { ImageFormat, ImageVersion } from "./variants"

/** The media library: an index row per file plus the file in object storage. */
export interface MediaOperations {
  list(storeId: string, query: { q?: string; page: number; pageSize: number }): Promise<{ items: MediaItem[]; total: number }>
  find(storeId: string, id: string): Promise<MediaItem | null>
  /** Any store (the public file route looks a file up by id alone). */
  findById(id: string): Promise<MediaItem | null>
  create(item: MediaItem, data: Uint8Array): Promise<MediaItem>
  /** Prepare immutable bytes outside the metadata/audit transaction. */
  stage(item: MediaItem, data: Uint8Array): Promise<MediaItem>
  commitPrepared(item: MediaItem): Promise<MediaItem>
  updateAlt(storeId: string, id: string, alt: string): Promise<MediaItem>
  remove(storeId: string, id: string): Promise<void>
  read(path: string): Promise<Uint8Array | null>
  readVariant(path: string, width: number, format: ImageFormat, version?: ImageVersion): Promise<Uint8Array | null>
  hasOrderUsage(storeId: string, url: string): Promise<boolean>
  /** Reference labels only, without granting access to product/customer records. */
  usage(storeId: string, url: string): Promise<string[]>
}

/** Raw storage boundary; services receive explicitly bound operations. */
export type MediaRepository = ActorScoped<MediaOperations>
