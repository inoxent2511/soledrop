import "server-only"

import { searchTerm, supabase, unwrap } from "@/server/db/supabase"
import type { MediaOperations } from "@/server/media/repository"
import type { MediaItem } from "@/server/media/types"
import { DomainError } from "@/server/shared/errors"

/** Index rows in `media` (migration 20261109090000), files in the Supabase Storage bucket `media` (runbook). */
const BUCKET = "media"

type MediaRecord = { id: string; store_id: string; path: string; filename: string; mime: MediaItem["mime"]; bytes: number; width: number; height: number; alt: string; created_by: string | null; created_at: string }

const toItem = (row: MediaRecord): MediaItem => ({
  id: row.id,
  storeId: row.store_id,
  path: row.path,
  filename: row.filename,
  mime: row.mime,
  bytes: row.bytes,
  width: row.width,
  height: row.height,
  alt: row.alt,
  createdBy: row.created_by,
  createdAt: row.created_at,
})

export function createSupabaseMediaRepository(): MediaOperations {
  return {
    async hasOrderUsage(storeId, url) {
      return unwrap(await supabase().rpc("media_has_order_usage", { p_store_id: storeId, p_url: url })) as boolean
    },
    async list(storeId, query) {
      let request = supabase().from("media").select("*", { count: "exact" }).eq("store_id", storeId)
      const term = query.q ? searchTerm(query.q) : ""
      if (term) request = request.or(`filename.ilike.*${term}*,alt.ilike.*${term}*`)
      const start = (query.page - 1) * query.pageSize
      const result = await request.order("created_at", { ascending: false }).range(start, start + query.pageSize - 1)
      const rows = unwrap(result) as MediaRecord[]
      return { items: rows.map(toItem), total: result.count ?? rows.length }
    },
    async find(storeId, id) {
      const row = unwrap(await supabase().from("media").select("*").eq("store_id", storeId).eq("id", id).maybeSingle()) as MediaRecord | null
      return row ? toItem(row) : null
    },
    async findById(id) {
      const row = unwrap(await supabase().from("media").select("*").eq("id", id).maybeSingle()) as MediaRecord | null
      return row ? toItem(row) : null
    },
    async create(item, data) {
      const upload = await supabase().storage.from(BUCKET).upload(item.path, data, { contentType: item.mime, upsert: false })
      if (upload.error) throw new Error(`Media upload failed: ${upload.error.message}`)
      const row = unwrap(
        await supabase()
          .from("media")
          .insert({ id: item.id, store_id: item.storeId, path: item.path, filename: item.filename, mime: item.mime, bytes: item.bytes, width: item.width, height: item.height, alt: item.alt, created_by: item.createdBy })
          .select("*")
          .single(),
      ) as MediaRecord
      return toItem(row)
    },
    async updateAlt(storeId, id, alt) {
      const row = unwrap(await supabase().from("media").update({ alt }).eq("store_id", storeId).eq("id", id).select("*").maybeSingle()) as MediaRecord | null
      if (!row) throw new DomainError("not_found", "Image not found.")
      return toItem(row)
    },
    async remove(storeId, id) {
      const row = unwrap(await supabase().from("media").delete().eq("store_id", storeId).eq("id", id).select("path").maybeSingle()) as { path: string } | null
      if (!row) throw new DomainError("not_found", "Image not found.")
      await supabase().storage.from(BUCKET).remove([row.path])
    },
    async read(path) {
      const download = await supabase().storage.from(BUCKET).download(path)
      if (download.error || !download.data) return null
      return new Uint8Array(await download.data.arrayBuffer())
    },
    async readVariant() { return null },
  }
}
