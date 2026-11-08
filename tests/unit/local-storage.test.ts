import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocalDiskStorage, digest } from "@/server/adapters/storage/local-disk"

const roots: string[] = []
async function root() { const directory = await fs.mkdtemp(path.join(os.tmpdir(), "soledrop-storage-")); roots.push(directory); return directory }
afterEach(async () => { vi.restoreAllMocks(); for (const directory of roots.splice(0)) await fs.rm(directory, { recursive: true, force: true }) })
describe("persistent private local object storage", () => {
  it("keeps immutable bytes through concurrent writes and adapter restarts", async () => {
    const directory = await root(), storage = new LocalDiskStorage(directory), bytes = new Uint8Array([1, 2, 3])
    await Promise.all([storage.put("store/image.webp", bytes), storage.put("store/image.webp", bytes)])
    await expect(storage.put("store/image.webp", new Uint8Array([7]))).rejects.toMatchObject({ code: "conflict" })
    expect(await new LocalDiskStorage(directory).get("store/image.webp")).toEqual({ data: bytes, etag: digest(bytes) })
    expect(await storage.writable()).toBe(true)
    expect(await storage.get("missing")).toBeNull()
    await storage.remove("store/image.webp")
    expect(await storage.get("store/image.webp")).toBeNull()
  })
  it("rejects traversal and linked storage parents before writing outside its root", async () => {
    const directory = await root(), external = await root(), storage = new LocalDiskStorage(directory)
    for (const key of ["../escape", "/absolute", "store\\escape", "a/./b", "a//b", "a\0b"]) await expect(storage.put(key, new Uint8Array([1]))).rejects.toMatchObject({ code: "validation" })
    const key = "linked/image.webp", folder = path.join(directory, digest(key).slice(0, 2))
    await fs.symlink(external, folder, "junction")
    await expect(storage.put(key, new Uint8Array([1]))).rejects.toMatchObject({ code: "unavailable" })
    await expect(storage.get(key)).rejects.toMatchObject({ code: "unavailable" })
    expect(await fs.readdir(external)).toEqual([])
  })
  it("reports disk-full failures without publishing a partial object or retaining temporary bytes", async () => {
    const directory = await root(), storage = new LocalDiskStorage(directory)
    vi.spyOn(fs, "writeFile").mockRejectedValueOnce(Object.assign(new Error("disk full"), { code: "ENOSPC" }))
    await expect(storage.put("store/new.webp", new Uint8Array([1]))).rejects.toMatchObject({ code: "unavailable" })
    expect(await storage.get("store/new.webp")).toBeNull()
    expect(await fs.readdir(path.join(directory, digest("store/new.webp").slice(0, 2)))).toEqual([])
  })
})
