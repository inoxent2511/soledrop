import type { Metadata } from "next"
import Link from "next/link"
import { z } from "zod"

import { AdminCard } from "@/components/admin/card"
import { DataTable } from "@/components/admin/data-table"
import { FilterBar } from "@/components/admin/filter-bar"
import { PageHeader } from "@/components/admin/page-header"
import { SynonymsEditor } from "@/features/admin/search/components/synonyms-editor"
import { can, permissionPage } from "@/server/admin/dal"
import { staffSearch } from "@/server/reports"

export const metadata: Metadata = { title: "Search" }

const params = z.object({ view: z.enum(["7", "90"]).optional().catch(undefined), fix: z.string().trim().max(60).optional().catch(undefined) })

export default async function AdminSearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await permissionPage("search:read", "/admin/search")
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))
  const query = params.parse(raw)
  const days = query.view ? Number(query.view) : 30
  const service = staffSearch()
  const [report, synonyms] = await Promise.all([service.report(staff, days), service.synonyms(staff)])
  const canWrite = can(staff, "search:write")
  const rate = report.searches ? Math.round((report.zeroResultSearches / report.searches) * 100) : 0

  return (
    <>
      <PageHeader title="Search" description="What shoppers look for on the store, what finds nothing, and the synonyms that close the gap." />
      <FilterBar
        fields={[]}
        views={[
          { key: "30", label: "Last 30 days" },
          { key: "7", label: "Last 7 days" },
          { key: "90", label: "Last 90 days" },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Searches", report.searches.toLocaleString("en-US")],
          ["Found nothing", `${report.zeroResultSearches.toLocaleString("en-US")} (${rate}%)`],
          ["Result clicks", report.clicks.toLocaleString("en-US")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-background p-4">
            <p className="text-14 text-subtle-foreground">{label}</p>
            <p className="text-24 font-extrabold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <AdminCard title="Top searches">
          <DataTable
            caption="Top searches"
            rows={report.top}
            rowKey={(row) => row.query}
            empty={<p className="text-16 text-subtle-foreground">No searches in this period.</p>}
            columns={[
              { key: "query", header: "Search", render: (row) => row.query },
              { key: "count", header: "Times", align: "end", render: (row) => row.count },
              { key: "clicks", header: "Clicked", align: "end", render: (row) => (row.count ? `${Math.round((row.clicks / row.count) * 100)}%` : "—") },
            ]}
          />
        </AdminCard>
        <AdminCard title="Searches that found nothing" description="Add a synonym, or the pairs people are asking for.">
          <DataTable
            caption="Searches with no results"
            rows={report.zero}
            rowKey={(row) => row.query}
            empty={<p className="text-16 text-subtle-foreground">Every search found something.</p>}
            columns={[
              { key: "query", header: "Search", render: (row) => row.query },
              { key: "count", header: "Times", align: "end", render: (row) => row.count },
              {
                key: "fix",
                header: "",
                align: "end",
                render: (row) =>
                  canWrite ? (
                    <Link href={`/admin/search?fix=${encodeURIComponent(row.query)}`} className="text-14 font-semibold underline underline-offset-4">
                      Add synonyms
                    </Link>
                  ) : null,
              },
            ]}
          />
        </AdminCard>
      </div>
      <AdminCard title="Synonyms">
        <SynonymsEditor key={query.fix ?? ""} synonyms={synonyms} canWrite={canWrite} suggestion={query.fix} />
      </AdminCard>
    </>
  )
}
