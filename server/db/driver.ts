import "server-only"

import { serverEnv } from "@/lib/env.server"
import { localStore } from "@/server/fixtures/store"
import { type ActorScoped, isActorScoped } from "@/server/db/actor"
import { bindActor } from "@/server/db/bind"
import { currentActor } from "@/server/db/context"

export type DataDriver = "local" | "fixtures" | "supabase"

/** Active data driver (DATA_DRIVER). Each domain's index.ts picks its repository from this. */
export function dataDriver(): DataDriver {
  return serverEnv.DATA_DRIVER
}

/** The store this deployment serves (multi-store: one store per deployment, data scoped by store_id). */
export function currentStoreId(): string {
  return serverEnv.STORE_ID
}

/** Keep multi-repository staff writes and media reference checks in one local transaction. */
export function localService<T extends object>(service: T): T {
  if (dataDriver() !== "local") return service
  return new Proxy(service, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver)
      return typeof value === "function" ? (...args: unknown[]) => localStore().run(() => value.apply(receiver, args)) : value
    },
  })
}

/** Picks the repository implementation for the active driver, creating it once. */
export function selectRepository<T extends object>(implementations: { fixtures: () => T | ActorScoped<NoInfer<T>>; supabase: () => T }): () => T {
  let instance: T | undefined
  return () => {
    if (!instance) {
      const driver = dataDriver()
      const raw = implementations[driver === "local" ? "fixtures" : driver]()
      const repository = isActorScoped<T>(raw) ? bindActor<T>(raw, currentActor) : raw
      // Reuse the tested domain operations with durable storage and one queue across all domains.
      instance = driver !== "local" ? repository : new Proxy(repository, {
        get(target, key, receiver) {
          const value = Reflect.get(target, key, receiver)
          return typeof value === "function" ? (...args: unknown[]) => localStore().run(async () => structuredClone(await value.apply(receiver, args))) : value
        },
      })
    }
    return instance
  }
}
