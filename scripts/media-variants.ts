import { serverEnv } from "@/lib/env.server"
import { ALL_PERMISSIONS } from "@/server/admin/permissions"
import { createMysqlMediaRepository } from "@/server/media/mysql.repository"
import { writeImageVariants } from "@/server/media/variants"
import { systemActor } from "@/server/db/actor"
import { closeDatabase } from "@/server/db/client"
import { storage } from "@/server/adapters/storage"

const url = new URL(process.env.DATABASE_URL ?? "")
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Run media preparation locally or through a loopback SSH session")
const actor = systemActor(serverEnv.STORE_ID, "migration", ALL_PERMISSIONS), media = createMysqlMediaRepository()
let prepared = 0
try {
  for (let page = 1; ; page++) {
    const result = await media.list(actor, actor.storeId, { page, pageSize: 50 })
    for (const item of result.items) {
      const bytes = await storage().get(item.path)
      if (!bytes) throw new Error("An indexed original image is missing")
      await writeImageVariants(item.path, bytes.data, (key, data) => storage().put(key, data))
      prepared++
      if (prepared % 10 === 0) process.stdout.write(JSON.stringify({ preparedImages: prepared, total: result.total, complete: false }) + "\n")
    }
    if (page * 50 >= result.total) break
  }
  process.stdout.write(JSON.stringify({ preparedImages: prepared }) + "\n")
} finally { await closeDatabase() }
