import "server-only"

import { serverEnv } from "@/lib/env.server"
import { localStore } from "@/server/fixtures/store"
import { type ActorScoped, isActorScoped } from "@/server/db/actor"
import { bindActor } from "@/server/db/bind"
import { currentActor } from "@/server/db/context"
import { withTransaction } from "@/server/db/client"
import { fixtureAtomic } from "@/server/fixtures/atomic"
import { withFixtureStore } from "@/server/fixtures/store"

export type DataDriver = "local" | "fixtures" | "mysql" | "supabase"

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
  if (dataDriver() === "supabase") return service
  return new Proxy(service, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver)
      return typeof value === "function" ? (...args: unknown[]) => dataDriver() === "mysql" ? withTransaction(async () => value.apply(receiver, args)) : dataDriver() === "local" ? localStore().run(() => value.apply(receiver, args)) : withFixtureStore(currentActor(), () => fixtureAtomic(async () => value.apply(receiver, args))) : value
    },
  })
}

/** Picks the repository implementation for the active driver, creating it once. */
export function selectRepository<T extends object>(implementations: { fixtures: () => ActorScoped<NoInfer<T>>; mysql: () => ActorScoped<NoInfer<T>>; supabase: () => T }): () => T {
  let instance: T | undefined
  return () => {
    if (!instance) {
      const driver = dataDriver()
      const raw = implementations[driver === "local" ? "fixtures" : driver]()
      if (driver !== "supabase" && !isActorScoped<T>(raw)) throw new Error("The selected repository must require an explicit actor")
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
