import type { Metadata } from "next"
import { z } from "zod"

import { AdminCard } from "@/components/admin/card"
import { FilterBar } from "@/components/admin/filter-bar"
import { PageHeader } from "@/components/admin/page-header"
import { StatusPill } from "@/components/admin/status-pill"
import { FlagSwitch, RunButton } from "@/features/admin/settings/components/settings-actions"
import { siteConfig } from "@/lib/site"
import { can, permissionPage } from "@/server/admin/dal"
import { staffPlatform } from "@/server/reports"

export const metadata: Metadata = { title: "Settings" }

const params = z.object({ view: z.enum(["integrations", "outbox", "health"]).optional().catch(undefined) })
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" })

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await permissionPage("settings:read", "/admin/settings")
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))
  const { view } = params.parse(raw)
  const service = staffPlatform()
  const canJobs = can(staff, "jobs:run")
  const tabs = (
    <FilterBar
      fields={[]}
      views={[
        { key: "flags", label: "Store & features" },
        { key: "integrations", label: "Integrations" },
        { key: "outbox", label: "Emails, webhooks & jobs" },
        { key: "health", label: "Health" },
      ]}
    />
  )

  if (view === "integrations") {
    const integrations = await service.integrations(staff)
    return (
      <>
        <PageHeader title="Settings" description="Keys and endpoints live in the server's environment (never in the database or this screen); what is configured shows here." />
        {tabs}
        <div className="grid gap-6 lg:grid-cols-2">
          <AdminCard title="Payments">
            <ul className="flex flex-col gap-1.5 text-16">
              {integrations.payments.map((provider) => (
                <li key={provider.code} className="flex items-center justify-between gap-2">
                  {provider.label} <StatusPill tone={provider.available ? "success" : "neutral"}>{provider.available ? "Offered" : "Off"}</StatusPill>
                </li>
              ))}
              <li className="flex items-center justify-between gap-2 text-14 text-subtle-foreground">
                Bank account details <span>{integrations.bankTransferConfigured ? "Set" : "Not set (BANK_NAME, BANK_ACCOUNT_TITLE, BANK_IBAN)"}</span>
              </li>
            </ul>
          </AdminCard>
          <AdminCard title="Email">
            <p className="text-16">
              Provider: <strong>{integrations.email === "console" ? "Console (development: emails are logged, not sent)" : "Resend"}</strong>
            </p>
            <p className="text-14 text-subtle-foreground">From: {integrations.emailFrom}</p>
          </AdminCard>
          <AdminCard title="Webhooks" description="Signed POSTs for order, payment and customer events (WEBHOOK_ENDPOINTS).">
            {integrations.webhooks.length === 0 ? <p className="text-16 text-subtle-foreground">None configured.</p> : null}
            <ul className="flex flex-col gap-1 text-16">
              {integrations.webhooks.map((hook, index) => (
                <li key={index}>
                  {hook.host} <span className="text-14 text-subtle-foreground">· {hook.topics.join(", ")}</span>
                </li>
              ))}
            </ul>
          </AdminCard>
          <AdminCard title="API keys" description="For /api/v1 (API_KEYS). Names and scopes only.">
            {integrations.apiKeys.length === 0 ? <p className="text-16 text-subtle-foreground">None configured.</p> : null}
            <ul className="flex flex-col gap-1 text-16">
              {integrations.apiKeys.map((key, index) => (
                <li key={index}>
                  {key.name} <span className="text-14 text-subtle-foreground">· {key.scopes.join(" + ")}</span>
                </li>
              ))}
            </ul>
          </AdminCard>
          <AdminCard title="Bot protection">
            <p className="text-16">{integrations.turnstileConfigured ? "Cloudflare Turnstile is on for sign-up and contact forms." : "Turnstile isn't configured (TURNSTILE_SECRET_KEY); forms rely on rate limits."}</p>
          </AdminCard>
          <AdminCard title="Data">
            <p className="text-16">Driver: {integrations.driver === "fixtures" ? "In-memory sample data (no database)" : "Supabase Postgres"}</p>
          </AdminCard>
        </div>
      </>
    )
  }

  if (view === "outbox") {
    const outbox = await service.outbox(staff)
    return (
      <>
        <PageHeader title="Settings" description="Emails and webhooks wait in the outbox and are sent with retries. Jobs run on their schedule; run one now if needed." />
        {tabs}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Waiting", outbox.pending, "pending"],
            ["Sent", outbox.delivered, "success"],
            ["Failed", outbox.failed, outbox.failed ? "danger" : "neutral"],
          ].map(([label, count, tone]) => (
            <div key={label as string} className="flex items-center justify-between rounded-lg border border-border bg-background p-4">
              <span className="text-16">{label}</span>
              <StatusPill tone={tone as "pending"}>{count as number}</StatusPill>
            </div>
          ))}
        </div>
        {canJobs ? (
          <AdminCard title="Run a job now">
            <div className="flex flex-wrap gap-4">
              <RunButton label="Send waiting emails and webhooks" path="/api/admin/settings/jobs/outbox" summary="outbox" />
              <RunButton label="Release expired bag holds" path="/api/admin/settings/jobs/release-reservations" summary="released" />
              <RunButton label="Delete month-old guest bags" path="/api/admin/settings/jobs/purge-carts" summary="purged" />
            </div>
          </AdminCard>
        ) : null}
        <AdminCard title="Failed">
          {outbox.recentFailed.length === 0 ? <p className="text-16 text-subtle-foreground">Nothing failed.</p> : null}
          <ul className="flex flex-col divide-y divide-border text-16">
            {outbox.recentFailed.map((event) => (
              <li key={event.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <span className="flex flex-col">
                  <span className="font-semibold">{event.topic}</span>
                  <span className="text-14 text-subtle-foreground">
                    {when(event.createdAt)} · {event.attempts} tries · {event.lastError ?? "no error recorded"}
                  </span>
                </span>
                {canJobs ? <RunButton label="Retry" path={`/api/admin/settings/outbox/${event.id}`} /> : null}
              </li>
            ))}
          </ul>
        </AdminCard>
        <AdminCard title="Recent webhook deliveries">
          {outbox.deliveries.length === 0 ? <p className="text-16 text-subtle-foreground">No webhook deliveries yet.</p> : null}
          <ul className="flex flex-col divide-y divide-border text-14">
            {outbox.deliveries.map((delivery) => (
              <li key={delivery.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>{(() => { try { return new URL(delivery.endpoint).host } catch { return "endpoint" } })()}</span>
                <span className="flex items-center gap-2">
                  <StatusPill tone={delivery.status === "delivered" ? "success" : "danger"}>{delivery.responseStatus ?? delivery.status}</StatusPill> {when(delivery.at)}
                </span>
              </li>
            ))}
          </ul>
        </AdminCard>
      </>
    )
  }

  if (view === "health") {
    const health = await service.health(staff)
    return (
      <>
        <PageHeader title="Settings" />
        {tabs}
        <AdminCard title="Health" description={`Checked ${when(health.at)}.`}>
          <dl className="grid grid-cols-2 gap-y-1.5 text-16">
            <dt>Database</dt>
            <dd>
              <StatusPill tone={health.database ? "success" : "danger"}>{health.database ? "Reachable" : "Not reachable"}</StatusPill> {health.latencyMs} ms
            </dd>
            <dt>Data driver</dt>
            <dd>{health.driver}</dd>
            <dt>Public checks</dt>
            <dd>
              <code>/api/health</code>, <code>/api/ready</code>
            </dd>
          </dl>
        </AdminCard>
      </>
    )
  }

  const flags = await service.flags(staff)
  const canFlags = can(staff, "settings:flags")
  return (
    <>
      <PageHeader title="Settings" description="The store's details and the features you can switch on and off." />
      {tabs}
      <AdminCard title="Store" description="Set in the site configuration (lib/site.ts); changing them is a release.">
        <dl className="grid gap-x-6 gap-y-1.5 text-16 sm:grid-cols-2">
          <div>
            <dt className="text-14 text-subtle-foreground">Name</dt>
            <dd>{siteConfig.name}</dd>
          </div>
          <div>
            <dt className="text-14 text-subtle-foreground">Address</dt>
            <dd className="break-all">{siteConfig.url}</dd>
          </div>
          <div>
            <dt className="text-14 text-subtle-foreground">Currency</dt>
            <dd>PKR</dd>
          </div>
          <div>
            <dt className="text-14 text-subtle-foreground">Language</dt>
            <dd>{siteConfig.locale}</dd>
          </div>
        </dl>
      </AdminCard>
      <AdminCard title="Features">
        <ul className="flex flex-col divide-y divide-border">
          {flags.map((flag) => (
            <li key={flag.key} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-16 font-semibold">
                  <code>{flag.key}</code>
                </span>
                <span className="text-14 text-subtle-foreground">{flag.description}</span>
                {flag.override !== null ? <span className="text-14 text-subtle-foreground">Set to {flag.override ? "on" : "off"} by the server environment (FEATURE_FLAGS); the switch has no effect.</span> : null}
                {flag.customerGroups?.length ? <span className="text-14 text-subtle-foreground">Only for: {flag.customerGroups.join(", ")}</span> : null}
              </div>
              <FlagSwitch flagKey={flag.key} enabled={flag.override ?? flag.enabled} overridden={flag.override !== null} canChange={canFlags} />
            </li>
          ))}
        </ul>
      </AdminCard>
    </>
  )
}
