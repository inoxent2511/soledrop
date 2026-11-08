import { serverEnv } from "@/lib/env.server"
import { ALL_PERMISSIONS } from "@/server/admin/permissions"
import { systemActor } from "@/server/db/actor"
import { closeDatabase } from "@/server/db/client"
import { normalizeDeliverySecrets } from "@/server/platform/normalize-delivery.repository"

const url = new URL(process.env.DATABASE_URL ?? "")
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Normalize delivery secrets locally or through a loopback SSH session")
const actor = systemActor(serverEnv.STORE_ID, "migration", ALL_PERMISSIONS)
let cursor: string | null = null, inspected = 0, changed = 0
try {
  for (;;) {
    const batch = await normalizeDeliverySecrets(actor, cursor)
    inspected += batch.count; changed += batch.changed; cursor = batch.cursor
    if (batch.count < 100) break
  }
  console.log(JSON.stringify({ inspected, changed, semanticDifferences: 0 }))
} finally { await closeDatabase() }
