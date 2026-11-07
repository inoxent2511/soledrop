import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"
import { db } from "./store"
import type { Atomic } from "@/server/shared/atomic"

const active = new AsyncLocalStorage<boolean>()
let queue = Promise.resolve()

/** Async reference transaction, including the outbox/audit and nested fixture operations. */
export const fixtureAtomic: Atomic = async (operation) => {
  if (active.getStore()) return operation()
  const previous = queue
  let release = () => {}
  queue = new Promise<void>((resolve) => { release = resolve })
  await previous
  const tables = db(), snapshot = structuredClone(tables)
  try { return await active.run(true, operation) }
  catch (error) { Object.assign(tables, snapshot); throw error }
  finally { release() }
}
