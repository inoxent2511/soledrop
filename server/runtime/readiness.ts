import "server-only"
import { serverEnv } from "@/lib/env.server"
import { systemActor } from "@/server/db/actor"
import { databaseStatus } from "@/server/db/client"
import { dataDriver } from "@/server/db/driver"
import { email } from "@/server/adapters/email"
import { storage } from "@/server/adapters/storage"
import { platform } from "@/server/platform"
import { deploymentStoreExists } from "./readiness.repository"
import { DomainError } from "@/server/shared/errors"

let mailCheck: { promise: Promise<boolean>; expires: number } | undefined
async function bounded<T>(operation: () => Promise<T>, timeout = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([operation(), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Readiness deadline exceeded")), timeout) })]) }
  finally { clearTimeout(timer) }
}
async function emailReady(): Promise<boolean> {
  if (!mailCheck || mailCheck.expires <= Date.now()) {
    const promise = bounded(async () => await email().provider.verify?.() ?? true).catch(() => false)
    mailCheck = { promise, expires: Date.now() + 30_000 }
  }
  return mailCheck.promise
}

/** Live bounded probes; the response contains no addresses, credentials or filesystem paths. */
export async function runtimeReadiness() {
  const driver = dataDriver(), started = performance.now()
  const checks = { database: false, schema: driver !== "mysql", store: false, storage: driver !== "mysql", email: false }
  let identity: Awaited<ReturnType<typeof databaseStatus>> | undefined
  await Promise.all([
    (async () => {
      try {
        if (driver === "mysql") {
          identity = await bounded(databaseStatus)
          checks.database = true; checks.schema = true
          checks.store = await bounded(() => deploymentStoreExists(systemActor(serverEnv.STORE_ID, "integration")))
        } else { checks.database = await bounded(() => platform().ping()); checks.store = checks.database }
      } catch (error) { if (error instanceof DomainError && error.details?.check === "schema") checks.database = true }
    })(),
    (async () => { if (driver === "mysql") { try { checks.storage = await bounded(() => storage().writable()) } catch {} } })(),
    (async () => { checks.email = await emailReady() })(),
  ])
  const ready = Object.values(checks).every(Boolean)
  return { status: ready ? "ready" as const : "unavailable" as const, driver, ...(identity ? { engine: identity.engine, version: identity.version, migration: identity.migration, poolMax: identity.poolMax } : {}), checks, latencyMs: Math.round(performance.now() - started) }
}
