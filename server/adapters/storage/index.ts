import "server-only"
import path from "node:path"
import { LocalDiskStorage } from "./local-disk"
import type { StorageAdapter } from "./types"
import { S3Storage } from "./s3"
import { serverEnv } from "@/lib/env.server"

let adapter: StorageAdapter | undefined
export function storage(): StorageAdapter {
  if (!adapter) {
    if (serverEnv.STORAGE_DRIVER === "s3") return adapter = new S3Storage({ endpoint: serverEnv.S3_ENDPOINT!, bucket: serverEnv.S3_BUCKET!, region: serverEnv.S3_REGION, accessKey: serverEnv.S3_ACCESS_KEY!, secretKey: serverEnv.S3_SECRET_KEY! })
    const directory = process.env.STORAGE_DIR ?? (process.env.NODE_ENV !== "production" ? path.resolve(".data/mysql-uploads") : undefined)
    if (!directory) throw new Error("STORAGE_DIR must identify a persistent absolute directory outside the deployed application")
    // Uploaded objects are runtime data and must never be traced into a release bundle.
    const root = path.resolve(/* turbopackIgnore: true */ directory), app = process.cwd()
    if (process.env.NODE_ENV === "production" && (root === app || root.startsWith(app + path.sep))) throw new Error("STORAGE_DIR must be outside the deployed application")
    adapter = new LocalDiskStorage(root)
  }
  return adapter
}
