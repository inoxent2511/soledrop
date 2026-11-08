import { serverEnv } from "@/lib/env.server"
import { systemActor } from "@/server/db/actor"
import { closeDatabase } from "@/server/db/client"
import { withActor } from "@/server/db/context"
import { createMysqlRefundIntentsRepository } from "@/server/orders/refund-intents.mysql.repository"
import { orderService } from "@/server/orders"
import { audit } from "@/server/platform/guards"

const database = new URL(process.env.DATABASE_URL ?? "")
if (serverEnv.DATA_DRIVER !== "mysql" || !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)) throw new Error("Run refund reconciliation locally or through a loopback SSH session")
const actor = systemActor(serverEnv.STORE_ID, "integration", ["orders:read", "orders:refund"])
const repository = createMysqlRefundIntentsRepository(), [operation, id, reason] = process.argv.slice(2)
try {
  if (operation === "pending") {
    const intents = await repository.pending(actor, 100)
    console.log(JSON.stringify(intents.map((row) => ({ id: row.id, orderId: row.orderId, amount: row.request.amount, provider: row.provider, status: row.status, createdAt: row.createdAt })), null, 2))
  } else if (operation === "reconcile" && id && reason && reason.length >= 3 && reason.length <= 500) {
    const intent = await repository.find(actor, id)
    if (!intent) throw new Error("Pending refund not found in this store")
    const result = await withActor(actor, () => orderService().refund(intent.request, async () => {
      await audit("system:refund-reconciliation", "refund.reconciled", "refund_intent", intent.id, null, { reason, amount: intent.request.amount })
    }, { readOnlyProvider: true }))
    console.log(JSON.stringify({ id: result.id, orderId: result.orderId, amount: result.amount, reconciled: true }))
  } else throw new Error('Usage: scripts/refunds.ts pending | reconcile <intent-id> "reason"')
} finally { await closeDatabase() }
