import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"
import { db } from "./store"
import type { Atomic } from "@/server/shared/atomic"
import type { Actor } from "@/server/db/actor"

const active = new AsyncLocalStorage<{ actors: Map<string, Actor> }>()
export const fixtureAdmissions = () => active.getStore()?.actors
let queue = Promise.resolve()

/** Async reference transaction, including the outbox/audit and nested fixture operations. */
export const fixtureAtomic: Atomic = async (operation) => {
  if (active.getStore()) return operation()
  const previous = queue
  let release = () => {}
  queue = new Promise<void>((resolve) => { release = resolve })
  await previous
  const tables = db(), snapshot = structuredClone(tables)
  try { return await active.run({ actors: new Map() }, operation) }
  catch (error) { Object.assign(tables, snapshot); throw error }
  finally { release() }
}
