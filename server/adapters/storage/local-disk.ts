import "server-only"

import fs from "node:fs/promises"
import path from "node:path"
import { createHash, randomBytes } from "node:crypto"
import type { StorageAdapter } from "./types"
import { DomainError } from "@/server/shared/errors"

export function digest(data: Uint8Array | string): string { return createHash("sha256").update(data).digest("hex") }

export class LocalDiskStorage implements StorageAdapter {
  readonly directory: string
  constructor(directory: string) {
    if (!path.isAbsolute(directory)) throw new TypeError("STORAGE_DIR must be absolute")
    this.directory = path.resolve(directory)
  }

  private file(key: string): string {
    if (!key || key.length > 512 || /[\\\x00-\x1f]/.test(key) || key.split("/").some((part) => !part || part === "." || part === "..") || path.isAbsolute(key)) throw new DomainError("validation", "Invalid storage key.")
    const hash = digest(key)
    return path.join(this.directory, hash.slice(0, 2), hash)
  }

  async put(key: string, data: Uint8Array) {
    const file = this.file(key), etag = digest(data), temporary = file + "." + randomBytes(8).toString("hex") + ".part"
    try {
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(temporary, data, { flag: "wx", mode: 0o600 })
      // Keys are immutable. Concurrent identical uploads can share their content safely.
      try { await fs.link(temporary, file) } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error
        const current = await this.get(key)
        if (!current || current.etag !== etag) throw new DomainError("conflict", "An immutable storage key already exists.")
      }
      return { etag }
    } catch (error) {
      if (error instanceof DomainError) throw error
      throw new DomainError("unavailable", "Image storage is unavailable. Please try again.")
    } finally { await fs.unlink(temporary).catch(() => undefined) }
  }

  async get(key: string) {
    const file = this.file(key)
    try {
      const stat = await fs.lstat(file)
      if (!stat.isFile() || stat.isSymbolicLink()) throw new DomainError("unavailable", "Invalid storage object.")
      const data = await fs.readFile(file)
      return { data: new Uint8Array(data), etag: digest(data) }
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null
      if (error instanceof DomainError) throw error
      throw new DomainError("unavailable", "Image storage is unavailable. Please try again.")
    }
  }

  async remove(key: string) { await fs.unlink(this.file(key)).catch((error: unknown) => { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error }) }

  async writable() {
    const probe = path.join(this.directory, ".probe-" + randomBytes(12).toString("hex"))
    try { await fs.mkdir(this.directory, { recursive: true }); await fs.writeFile(probe, "", { flag: "wx", mode: 0o600 }); return true }
    catch { return false }
    finally { await fs.unlink(probe).catch(() => undefined) }
  }
}
