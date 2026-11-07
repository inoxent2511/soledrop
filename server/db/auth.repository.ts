import "server-only"

import { eq } from "drizzle-orm"
import { type Actor, requireSystem } from "./actor"
import { withTransaction } from "./client"
import { stores } from "./schema"
import { DomainError } from "@/server/shared/errors"

/** Lock before any identity read: invite, MFA, credentials, session and audit commit together. */
export async function authTransaction<T>(actor: Actor, operation: () => Promise<T>): Promise<T> {
  requireSystem(actor, ["auth:customer", "auth:staff", "bootstrap"])
  return withTransaction(async (db) => {
    const [store] = await db.select({ id: stores.id }).from(stores).where(eq(stores.id, actor.storeId)).for("update")
    if (!store) throw new DomainError("not_found", "Store not found.")
    return operation()
  })
}
