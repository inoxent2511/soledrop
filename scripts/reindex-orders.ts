import { serverEnv } from "@/lib/env.server"
import { ALL_PERMISSIONS } from "@/server/admin/permissions"
import { systemActor } from "@/server/db/actor"
import { closeDatabase } from "@/server/db/client"
import { ORDER_REINDEX_BATCH, reindexOrderSearch } from "@/server/orders/search-index.repository"

const url = new URL(process.env.DATABASE_URL ?? "")
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Run order reindex locally or through a loopback SSH session")
const actor = systemActor(serverEnv.STORE_ID, "migration", ALL_PERMISSIONS)
let cursor: string | null = null, count = 0
try {
  for (;;) {
    const batch = await reindexOrderSearch(actor, cursor)
    count += batch.count; cursor = batch.cursor
    if (batch.count < ORDER_REINDEX_BATCH) break
  }
  process.stdout.write(JSON.stringify({ indexedOrders: count }) + "\n")
} finally { await closeDatabase() }
