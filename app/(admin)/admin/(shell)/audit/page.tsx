import type { Metadata } from "next"
import { z } from "zod"

import { DiffViewer } from "@/components/admin/diff-viewer"
import { EmptyState } from "@/components/admin/empty-state"
import { FilterBar } from "@/components/admin/filter-bar"
import { PageHeader } from "@/components/admin/page-header"
import { Pagination } from "@/components/admin/pagination"
import { adminService } from "@/server/admin"
import { permissionPage } from "@/server/admin/dal"
import { staffPlatform } from "@/server/reports"

export const metadata: Metadata = { title: "Audit log" }

const ENTITIES = ["order", "product", "collection", "variant", "customer", "promotion", "page", "faq", "staff", "role", "shipping_zone", "tax_rates", "media", "flag", "synonym"]

const params = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  entity: z.string().max(40).optional().catch(undefined),
  actor: z.string().max(80).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
})

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Karachi" })

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await permissionPage("audit:read", "/admin/audit")
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))
  const query = params.parse({ page: 1, ...raw })
  const [{ entries, total }, members] = await Promise.all([staffPlatform().audit(staff, { q: query.q, entity: query.entity, actor: query.actor, page: query.page, pageSize: 50 }), adminService().listStaff(staff)])
  const names = new Map(members.map((member) => [member.userId, member.displayName || member.email]))
  const actorName = (actor: string) => names.get(actor) ?? names.get(actor.replace(/^staff:/, "")) ?? actor

  return (
    <>
      <PageHeader title="Audit log" description="Every change made in the admin and by the system: who, when, from where, why, and what changed. It can't be edited or deleted." />
      <FilterBar
        searchLabel="Search by record (order number, product id…)"
        fields={[
          { kind: "select", name: "entity", label: "Record type", options: ENTITIES.map((value) => ({ value, label: value.replace("_", " ") })) },
          { kind: "select", name: "actor", label: "Who", options: members.map((member) => ({ value: member.userId, label: member.displayName || member.email })) },
        ]}
      />
      {entries.length === 0 ? <EmptyState title="Nothing recorded">Changes appear here as soon as they&apos;re made.</EmptyState> : null}
      <ol className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.id}>
            <details className="rounded-lg border border-border bg-background">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-16">
                <span className="flex flex-wrap items-center gap-2">
                  <code className="font-semibold">{entry.action}</code>
                  <span className="text-subtle-foreground">
                    {entry.entity} {entry.entityId !== "*" ? entry.entityId : ""}
                  </span>
                </span>
                <span className="text-14 text-subtle-foreground">
                  {actorName(entry.actor)} · {when(entry.at)}
                </span>
              </summary>
              <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
                {entry.reason ? (
                  <p className="text-16">
                    <span className="font-semibold">Reason:</span> {entry.reason}
                  </p>
                ) : null}
                <DiffViewer before={entry.before} after={entry.after} />
                <p className="text-14 text-faint-foreground">
                  {[entry.actorRole ? `Roles: ${entry.actorRole}` : null, entry.ip ? `IP ${entry.ip}` : null, entry.userAgent, entry.requestId ? `Request ${entry.requestId}` : null].filter(Boolean).join(" · ")}
                </p>
              </div>
            </details>
          </li>
        ))}
      </ol>
      <Pagination basePath="/admin/audit" params={raw} page={query.page} pageSize={50} total={total} />
    </>
  )
}
