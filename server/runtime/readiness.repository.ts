import "server-only"
import { eq } from "drizzle-orm"
import { requireSystem, type Actor } from "@/server/db/actor"
import { database } from "@/server/db/client"
import { stores } from "@/server/db/schema"

/** A deployment must name an existing store; readiness never bootstraps merchant data. */
export async function deploymentStoreExists(actor: Actor): Promise<boolean> {
  requireSystem(actor, ["integration"])
  const [store] = await (await database()).select({ id: stores.id }).from(stores).where(eq(stores.id, actor.storeId)).limit(1)
  return Boolean(store)
}
