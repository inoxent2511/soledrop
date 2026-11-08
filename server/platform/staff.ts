import "server-only"

import { serverEnv } from "@/lib/env.server"
import type { Permission } from "@/server/admin/permissions"
import type { RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import type { AuditQuery, PlatformOperations } from "@/server/platform/repository"
import type { FeatureFlag } from "@/server/platform/types"
import { DomainError } from "@/server/shared/errors"

/**
 * Staff settings and operations (admin A9): feature flags, integrations (read-only: secrets live
 * in the environment, A-018), the outbox and webhook deliveries, background jobs on demand, health,
 * and the audit log viewer.
 */

type Audit = (staff: StaffContext, meta: RequestMeta, entry: { action: string; entity: string; entityId: string; before?: unknown; after?: unknown; reason?: string | null; storeId: string }) => Promise<void>

export type JobName = "outbox" | "release-reservations" | "purge-carts"

type Deps = {
  platform: PlatformOperations
  audit: Audit
  jobs: Record<JobName, () => Promise<Record<string, unknown>>>
  overrides: () => Map<string, boolean>
  paymentProviders: () => Promise<{ code: string; label: string; available: boolean }[]>
  revalidate: () => void
}

const need = (staff: StaffContext, permission: Permission) => {
  if (!staff.permissions.includes(permission)) throw new DomainError("forbidden", "You don't have permission to do that.", { permission })
}

/** Host only: a webhook URL can carry a token in its path or query. */
const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return "(invalid URL)"
  }
}

export function createStaffPlatform(deps: Deps) {
  const { platform } = deps
  return {
    async flags(staff: StaffContext) {
      need(staff, "settings:read")
      const overrides = deps.overrides()
      return (await platform.listFlags(staff.member.storeId)).map((flag) => ({ ...flag, override: overrides.has(flag.key) ? (overrides.get(flag.key) as boolean) : null }))
    },

    async setFlag(staff: StaffContext, meta: RequestMeta, key: string, changes: { enabled: boolean; customerGroups?: string[] | null }) {
      need(staff, "settings:flags")
      const before = (await platform.listFlags(staff.member.storeId)).find((flag) => flag.key === key)
      if (!before) throw new DomainError("not_found", "Unknown flag.")
      const saved: FeatureFlag = await platform.setFlag(staff.member.storeId, key, changes)
      await deps.audit(staff, meta, { action: "flag.changed", entity: "flag", entityId: key, before: { enabled: before.enabled, customerGroups: before.customerGroups ?? null }, after: { enabled: saved.enabled, customerGroups: saved.customerGroups ?? null }, storeId: staff.member.storeId })
      deps.revalidate()
      return saved
    },

    /** What is configured, never the secrets: endpoints by host, API keys by name and scope. */
    async integrations(staff: StaffContext) {
      need(staff, "settings:read")
      const webhooks = serverEnv.WEBHOOK_ENDPOINTS.split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const [url, , topics = "*"] = entry.split("|")
          return { host: hostOf(url), topics: topics.split("+") }
        })
      const apiKeys = serverEnv.API_KEYS.split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const [name, , scopes = "read"] = entry.split(":")
          return { name, scopes: scopes.split("+") }
        })
      return {
        driver: serverEnv.DATA_DRIVER,
        email: serverEnv.EMAIL_PROVIDER,
        emailFrom: serverEnv.EMAIL_FROM,
        payments: await deps.paymentProviders(),
        webhooks: staff.permissions.includes("settings:webhooks") ? webhooks : webhooks.map((hook) => ({ ...hook, host: "•••" })),
        apiKeys: staff.permissions.includes("settings:api_keys") ? apiKeys : apiKeys.map((key) => ({ ...key, name: "•••" })),
        bankTransferConfigured: Boolean(serverEnv.BANK_NAME && serverEnv.BANK_ACCOUNT_TITLE && serverEnv.BANK_IBAN),
        turnstileConfigured: Boolean(serverEnv.TURNSTILE_SECRET_KEY),
      }
    },

    async outbox(staff: StaffContext) {
      need(staff, "settings:read")
      return platform.outboxSummary(staff.member.storeId)
    },

    async retryEvent(staff: StaffContext, meta: RequestMeta, id: string) {
      need(staff, "jobs:run")
      await platform.retryEvent(staff.member.storeId, id)
      await deps.audit(staff, meta, { action: "outbox.retried", entity: "outbox_event", entityId: id, storeId: staff.member.storeId })
    },

    /** Runs a background job now (they also run on their schedule, docs/DEPLOYMENT-RUNBOOK.md). */
    async runJob(staff: StaffContext, meta: RequestMeta, name: JobName) {
      need(staff, "jobs:run")
      await deps.audit(staff, meta, { action: "job.started", entity: "job", entityId: name, storeId: staff.member.storeId })
      const result = await deps.jobs[name]()
      await deps.audit(staff, meta, { action: "job.run", entity: "job", entityId: name, after: result, storeId: staff.member.storeId })
      return result
    },

    async health(staff: StaffContext) {
      need(staff, "settings:read")
      const started = Date.now()
      const database = await platform.ping().catch(() => false)
      return { database, latencyMs: Date.now() - started, driver: serverEnv.DATA_DRIVER, at: new Date().toISOString() }
    },

    async audit(staff: StaffContext, query: AuditQuery) {
      need(staff, "audit:read")
      return platform.searchAudit(staff.member.storeId, query)
    },
  }
}

export type StaffPlatform = ReturnType<typeof createStaffPlatform>
