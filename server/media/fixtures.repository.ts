import "server-only"
import { fixturePolicy } from "@/server/db/fixtures-policy.repository"
import { mediaGuards } from "@/server/db/fixture-guards.repository"

import fs from "node:fs"

import { db, localStore, transaction } from "@/server/fixtures/store"
import { serverEnv } from "@/lib/env.server"
import { localMediaFile, writeLocalMedia } from "@/server/db/local-media"
import type { MediaOperations, MediaRepository } from "@/server/media/repository"
import { DomainError } from "@/server/shared/errors"
import { variantKey, writeImageVariants } from "./variants"

/**
 * Fixtures driver: index rows in the fixture tables, file bytes in process memory beside them
 * (kept out of the tables so transactions don't copy images). Both last for the server's life.
 */
const files = ((globalThis as unknown as { __soledropMedia?: Map<string, Uint8Array> }).__soledropMedia ??= new Map())

function localFile(key: string) {
  return localMediaFile(localStore().directory, key)
}

export function createFixturesMediaRepository(): MediaRepository {
  const operations: MediaOperations = {
    async hasOrderUsage(storeId, url) {
      return db().orders.some((order) => order.storeId === storeId && order.lines.some((line) => line.imageUrl === url))
    },
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
      await writeImageVariants(item.path, data, async (key, bytes) => {
        if (serverEnv.DATA_DRIVER === "local") writeLocalMedia(localStore().directory, key, bytes)
        else files.set(key, bytes)
      })
      if (serverEnv.DATA_DRIVER === "local") {
        writeLocalMedia(localStore().directory, item.path, data)
      } else files.set(item.path, data)
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
      // Local files stay private after index deletion, allowing recovery if a metadata save fails.
      // An offline backup/cleanup can remove files no longer referenced by the saved index.
      if (serverEnv.DATA_DRIVER !== "local") files.delete(item.path)
    },
    async read(path) {
      if (!db().media.some((row) => row.path === path)) return null
      if (serverEnv.DATA_DRIVER === "local") {
        const file = localFile(path)
        return fs.existsSync(file) ? new Uint8Array(fs.readFileSync(file)) : null
      }
      return files.get(path) ?? null
    },
    async readVariant(path, width, format) {
      const key = variantKey(path, width, format)
      if (!db().media.some((row) => row.path === path)) return null
      if (serverEnv.DATA_DRIVER === "local") {
        const file = localFile(key)
        return fs.existsSync(file) ? new Uint8Array(fs.readFileSync(file)) : null
      }
      return files.get(key) ?? null
    },
  }
  return fixturePolicy<MediaOperations>(operations, mediaGuards)
}
