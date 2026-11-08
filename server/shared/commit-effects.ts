import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"

const effects = new AsyncLocalStorage<(() => void)[]>()

/** Invalidation follows a successful outer unit of work; rolled-back changes emit nothing. */
export function afterCommit(effect: () => void): void {
  const pending = effects.getStore()
  if (pending) pending.push(effect)
  else effect()
}

export async function withCommitEffects<T>(operation: () => Promise<T>): Promise<T> {
  if (effects.getStore()) return operation()
  const pending: (() => void)[] = []
  const result = await effects.run(pending, operation)
  for (const effect of new Set(pending)) effect()
  return result
}
