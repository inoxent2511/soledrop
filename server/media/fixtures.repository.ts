import "server-only"

import { db, transaction } from "@/server/fixtures/store"
import type { MediaRepository } from "@/server/media/repository"
import { DomainError } from "@/server/shared/errors"

/**
 * Fixtures driver: index rows in the fixture tables, file bytes in process memory beside them
 * (kept out of the tables so transactions don't copy images). Both last for the server's life.
 */
const files = ((globalThis as unknown as { __soledropMedia?: Map<string, Uint8Array> }).__soledropMedia ??= new Map())

export function createFixturesMediaRepository(): MediaRepository {
  return {
    async list(storeId, query) {
      const q = query.q?.trim().toLowerCase()
      const found = db()
        .media.filter((item) => item.storeId === storeId && (!q || item.filename.toLowerCase().includes(q) || item.alt.toLowerCase().includes(q)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const start = (query.page - 1) * query.pageSize
      return { items: structuredClone(found.slice(start, start + query.pageSize)), total: found.length }
    },
    async find(storeId, id) {
      return structuredClone(db().media.find((item) => item.storeId === storeId && item.id === id) ?? null)
    },
    async findById(id) {
      return structuredClone(db().media.find((item) => item.id === id) ?? null)
    },
    async create(item, data) {
      files.set(item.path, data)
      db().media.push(structuredClone(item))
      return structuredClone(item)
    },
    async updateAlt(storeId, id, alt) {
      return transaction((tables) => {
        const item = tables.media.find((row) => row.storeId === storeId && row.id === id)
        if (!item) throw new DomainError("not_found", "Image not found.")
        item.alt = alt
        return structuredClone(item)
      })
    },
    async remove(storeId, id) {
      const tables = db()
      const item = tables.media.find((row) => row.storeId === storeId && row.id === id)
      if (!item) throw new DomainError("not_found", "Image not found.")
      tables.media = tables.media.filter((row) => row !== item)
      files.delete(item.path)
    },
    async read(path) {
      return files.get(path) ?? null
    },
  }
}
