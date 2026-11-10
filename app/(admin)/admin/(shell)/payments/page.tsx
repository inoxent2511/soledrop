import { Landmark } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { z } from "zod"

import { AdminCard } from "@/components/admin/card"
import { DataTable } from "@/components/admin/data-table"
import { EmptyState } from "@/components/admin/empty-state"
import { FilterBar } from "@/components/admin/filter-bar"
import { PageHeader } from "@/components/admin/page-header"
import { Pagination } from "@/components/admin/pagination"
import { StatusPill } from "@/components/admin/status-pill"
import { PAYMENT_METHOD } from "@/features/admin/orders/status"
import { ReconcileButton } from "@/features/admin/payments/components/reconcile-button"
import { formatPrice } from "@/lib/format"
import { can, permissionPage } from "@/server/admin/dal"
import { staffOrders } from "@/server/orders"
import type { LedgerRow } from "@/server/orders/repository"

export const metadata: Metadata = { title: "Payments" }

const params = z.object({
  view: z.enum(["refunds"]).optional().catch(undefined),
  provider: z.enum(["cod", "bank_transfer", "stripe"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
})

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" })
const PROVIDER: Record<string, string> = { ...PAYMENT_METHOD, stripe: "Card (Stripe)" }

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await permissionPage("payments:read", "/admin/payments")
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))
  const query = params.parse({ page: 1, ...raw })
  const service = staffOrders()
  const pageSize = 50
  const [overview, ledger] = await Promise.all([service.paymentsOverview(staff), service.ledger(staff, { kind: query.view === "refunds" ? "refunds" : "payments", provider: query.provider, page: query.page, pageSize })])
  const canReconcile = can(staff, "payments:reconcile")
  const canOrders = can(staff, "orders:read")

  return (
    <>
      <PageHeader title="Payments" description="How shoppers pay, bank transfers waiting to be matched, and every payment and refund." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-14 text-subtle-foreground">Taken today</p>
          <p className="text-24 font-extrabold tabular-nums">{formatPrice(overview.today.amount)}</p>
          <p className="text-14 text-subtle-foreground">{overview.today.count} payments</p>
        </div>
        {overview.providers.map((provider) => (
          <div key={provider.code} className="flex flex-col gap-1 rounded-lg border border-border bg-background p-4">
            <p className="text-14 text-subtle-foreground">{PROVIDER[provider.code] ?? provider.label}</p>
            <StatusPill tone={provider.available ? "success" : "neutral"}>{provider.available ? "Offered at checkout" : "Not offered"}</StatusPill>
            {!provider.available && provider.code === "bank_transfer" ? <p className="text-14 text-subtle-foreground">Needs the bank details in the environment (BANK_NAME, BANK_ACCOUNT_TITLE, BANK_IBAN).</p> : null}
            {!provider.available && provider.code === "stripe" ? <p className="text-14 text-subtle-foreground">Needs Stripe keys and the stripe-payments flag.</p> : null}
          </div>
        ))}
      </div>

      <AdminCard title={`Bank transfers to match (${overview.queue.length})`} description="Orders waiting for a bank transfer, oldest first. Check the statement, then record what arrived.">
        <DataTable
          caption="Bank transfers waiting"
          rows={overview.queue}
          rowKey={(row) => row.id}
          href={canOrders ? (row) => `/admin/orders/${row.number}` : undefined}
          empty={<EmptyState icon={Landmark} title="Nothing waiting">Every bank-transfer order has been matched.</EmptyState>}
          columns={[
            { key: "number", header: "Order", render: (row) => row.number },
            { key: "customer", header: "Customer", hideBelow: "sm", render: (row) => row.customer },
            { key: "waiting", header: "Waiting", render: (row) => (row.waitingHours >= 48 ? <StatusPill tone="danger">{Math.floor(row.waitingHours / 24)} days</StatusPill> : `${row.waitingHours} h`) },
            { key: "total", header: "Total", align: "end", render: (row) => formatPrice(row.total, row.currency) },
            { key: "action", header: "", align: "end", render: (row) => (canReconcile ? <ReconcileButton number={row.number} total={row.total} /> : null) },
          ]}
        />
      </AdminCard>

      <FilterBar
        fields={[{ kind: "select", name: "provider", label: "Method", options: Object.entries(PROVIDER).map(([value, label]) => ({ value, label })) }]}
        views={[
          { key: "payments", label: "Payments" },
          { key: "refunds", label: "Refunds" },
        ]}
      />
      <DataTable<LedgerRow>
        caption={query.view === "refunds" ? "Refunds" : "Payments"}
        rows={ledger.rows}
        rowKey={(row) => row.id}
        empty={<p className="text-16 text-subtle-foreground">Nothing yet.</p>}
        columns={[
          { key: "at", header: "When", render: (row) => when(row.at) },
          { key: "order", header: "Order", render: (row) => (canOrders ? <Link prefetch={false} href={`/admin/orders/${row.orderNumber}`} className="font-semibold underline-offset-4 hover:underline">{row.orderNumber}</Link> : row.orderNumber) },
          { key: "method", header: "Method", hideBelow: "sm", render: (row) => (row.provider ? (PROVIDER[row.provider] ?? row.provider) : "—") },
          { key: "status", header: "Status", render: (row) => <StatusPill tone={row.status === "captured" ? "success" : row.status === "failed" ? "danger" : row.status === "refunded" ? "neutral" : "pending"}>{row.status.replace("_", " ")}</StatusPill> },
          { key: "detail", header: query.view === "refunds" ? "Reason" : "Reference", hideBelow: "md", render: (row) => row.reason ?? row.reference ?? "—" },
          { key: "amount", header: "Amount", align: "end", render: (row) => `${query.view === "refunds" ? "−" : ""}${formatPrice(row.amount)}` },
        ]}
      />
      <Pagination basePath="/admin/payments" params={raw} page={query.page} pageSize={pageSize} total={ledger.total} />
    </>
  )
}
