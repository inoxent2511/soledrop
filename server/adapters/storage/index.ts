import "server-only"
import path from "node:path"
import { LocalDiskStorage } from "./local-disk"
import type { StorageAdapter } from "./types"

let adapter: StorageAdapter | undefined
export function storage(): StorageAdapter {
  if (!adapter) {
    const directory = process.env.STORAGE_DIR ?? (process.env.NODE_ENV !== "production" ? path.resolve(".data/mysql-uploads") : undefined)
    if (!directory) throw new Error("STORAGE_DIR must identify a persistent absolute directory outside the deployed application")
    const root = path.resolve(directory), app = process.cwd()
    if (process.env.NODE_ENV === "production" && (root === app || root.startsWith(app + path.sep))) throw new Error("STORAGE_DIR must be outside the deployed application")
    adapter = new LocalDiskStorage(root)
  }
  return adapter
}
