import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

export function localMediaFile(directory: string, key: string) {
  return path.join(directory, "media", `${createHash("sha256").update(key).digest("hex")}.webp`)
}

export function writeLocalMedia(directory: string, key: string, bytes: Uint8Array) {
  const file = localMediaFile(directory, key)
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const fd = fs.openSync(file, "wx", 0o600)
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}
