import "server-only"

import { serverEnv } from "@/lib/env.server"
import { localStore } from "@/server/fixtures/store"
import { type ActorScoped, isActorScoped } from "@/server/db/actor"
import { bindActor } from "@/server/db/bind"
import { currentActor } from "@/server/db/context"
import { withTransaction } from "@/server/db/client"
import { fixtureAtomic } from "@/server/fixtures/atomic"
import { withFixtureStore } from "@/server/fixtures/store"
import { withCommitEffects } from "@/server/shared/commit-effects"

export type DataDriver = "local" | "fixtures" | "mysql"

/** Active data driver (DATA_DRIVER). Each domain's index.ts picks its repository from this. */
export function dataDriver(): DataDriver {
  return serverEnv.DATA_DRIVER
}

/** The store this deployment serves (multi-store: one store per deployment, data scoped by store_id). */
export function currentStoreId(): string {
  return serverEnv.STORE_ID
}

/** A mutation and its mandatory audit share a commit on every retained driver. */
export function unitOfWork<T>(operation: () => Promise<T>): Promise<T> {
  return withCommitEffects(() => dataDriver() === "mysql" ? withTransaction(operation) : dataDriver() === "local" ? localStore().run(operation) : withFixtureStore(currentActor(), () => fixtureAtomic(operation)))
}

/** Keep multi-repository staff writes and media reference checks in one local transaction. */
export function localService<T extends object>(service: T, writes?: readonly (keyof T)[]): T {
  return new Proxy(service, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver)
      if (typeof value !== "function" || writes && !writes.includes(key as keyof T)) return value
      return (...args: unknown[]) => unitOfWork(async () => value.apply(receiver, args))
    },
  })
}

/** Picks the repository implementation for the active driver, creating it once. */
export function selectRepository<T extends object>(implementations: { fixtures: () => ActorScoped<T>; mysql: () => ActorScoped<T> }): () => T {
  let instance: T | undefined
  return () => {
    if (!instance) {
      const driver = dataDriver()
      const raw = implementations[driver === "local" ? "fixtures" : driver]()
      if (!isActorScoped<T>(raw)) throw new Error("The selected repository must require an explicit actor")
      const repository = bindActor<T>(raw, currentActor)
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
