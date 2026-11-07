import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { deserialize } from "node:v8"
import { ALL_PERMISSIONS } from "@/server/admin/permissions"
import { systemActor } from "@/server/db/actor"
import { closeDatabase } from "@/server/db/client"
import { importSnapshot } from "@/server/db/import.repository"
import { LocalDiskStorage } from "@/server/adapters/storage/local-disk"
import type { FixtureTables } from "@/server/fixtures/tables"

const source = path.resolve(process.argv[2] ?? "")
if (!process.argv[2] || !process.env.DATABASE_URL || !process.env.STORAGE_DIR) throw new Error("Provide source directory, local DATABASE_URL and absolute STORAGE_DIR")
const destination = new URL(process.env.DATABASE_URL)
if (!["127.0.0.1", "localhost", "[::1]"].includes(destination.hostname) || !/^\/soledrop_(migration|test|qa)(_[a-z0-9]+)?$/.test(destination.pathname)) throw new Error("This preservation import only targets new task-owned local databases")
const bytes = await fs.readFile(path.join(source, "store.bin"))
const envelope = deserialize(bytes) as { version: number; state: Buffer; digest: string }
if (envelope.version !== 1 || !Buffer.isBuffer(envelope.state) || createHash("sha256").update(envelope.state).digest("hex") !== envelope.digest) throw new Error("Saved-store integrity check failed")
const tables = deserialize(envelope.state) as FixtureTables
const storage = new LocalDiskStorage(process.env.STORAGE_DIR)
// File failure occurs before metadata import; the original copy is never modified.
for (const item of tables.media) {
  const filename = createHash("sha256").update(item.path).digest("hex") + ".webp"
  const data = await fs.readFile(path.join(source, "media", filename))
  if (data.length !== item.bytes) throw new Error("Image byte count mismatch for " + item.id)
  await storage.put(item.path, data)
}
try {
  const counts = await importSnapshot(systemActor(tables.stores[0].id, "migration", ALL_PERMISSIONS), tables, envelope.digest)
  process.stdout.write(JSON.stringify({ imported: counts, verifiedMediaFiles: tables.media.length, sourceDigest: envelope.digest }) + "\n")
} finally { await closeDatabase() }
