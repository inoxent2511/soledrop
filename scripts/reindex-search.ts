import { serverEnv } from "@/lib/env.server"
import { ALL_PERMISSIONS } from "@/server/admin/permissions"
import { reindexCatalogueSearch } from "@/server/catalog/mysql.repository"
import { systemActor } from "@/server/db/actor"
import { closeDatabase } from "@/server/db/client"

const url = new URL(process.env.DATABASE_URL ?? "")
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Run search reindex locally or through a loopback SSH session")
const actor = systemActor(serverEnv.STORE_ID, "migration", ALL_PERMISSIONS)
let cursor: string | null = null, count = 0
try {
  for (;;) {
    const batch = await reindexCatalogueSearch(actor, cursor)
    count += batch.count; cursor = batch.cursor
    if (batch.count < 500) break
  }
  process.stdout.write(JSON.stringify({ indexedProducts: count }) + "\n")
} finally { await closeDatabase() }
