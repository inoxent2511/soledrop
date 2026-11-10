import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AdminCard } from "@/components/admin/card"
import { DataTable } from "@/components/admin/data-table"
import { DetailLayout } from "@/components/admin/detail-layout"
import { PageHeader } from "@/components/admin/page-header"
import { StatusPill } from "@/components/admin/status-pill"
import { CustomerActions } from "@/features/admin/customers/components/customer-actions"
import { OrderStatusPill, PaymentStatusPill } from "@/features/admin/orders/status"
import { formatDate, formatPrice } from "@/lib/format"
import { can, permissionPage } from "@/server/admin/dal"
import { staffCustomers } from "@/server/customers"
import { isDomainError } from "@/server/shared/errors"

type Props = { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: "Customer" }

export default async function AdminCustomerPage({ params }: Props) {
  const { id } = await params
  const staff = await permissionPage("customers:read", `/admin/customers/${id}`)
  const detail = await staffCustomers()
    .detail(staff, id)
    .catch((error) => {
      if (isDomainError(error) && error.code === "not_found") notFound()
      throw error
    })
  const { customer, addresses, orders, stats } = detail
  const canOrders = can(staff, "orders:read")

  return (
    <>
      <PageHeader
        title={customer.fullName}
        crumbs={[{ label: "Customers", href: "/admin/customers" }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {customer.group === "wholesale" ? <StatusPill tone="info">Wholesale</StatusPill> : <StatusPill tone="neutral">Retail</StatusPill>}
            {customer.deletionRequested ? <StatusPill tone="danger">Asked to delete their account</StatusPill> : null}
            <span>Customer since {formatDate(customer.createdAt)}</span>
          </span>
        }
      />
      <DetailLayout
        main={
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Orders", String(stats.orders)],
                ["Spent", formatPrice(stats.spent)],
                ["Refunded", formatPrice(stats.refunded)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-background p-4">
                  <p className="text-14 text-subtle-foreground">{label}</p>
                  <p className="text-24 font-extrabold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            <AdminCard title="Orders">
              <DataTable
                caption="Customer orders"
                rows={orders}
                rowKey={(order) => order.number}
                href={canOrders ? (order) => `/admin/orders/${order.number}` : undefined}
                empty={<p className="text-16 text-subtle-foreground">No orders yet.</p>}
                columns={[
                  { key: "number", header: "Order", render: (order) => order.number },
                  { key: "placed", header: "Placed", render: (order) => formatDate(order.placedAt) },
                  { key: "status", header: "Status", render: (order) => <OrderStatusPill status={order.status} /> },
                  { key: "payment", header: "Payment", hideBelow: "sm", render: (order) => <PaymentStatusPill status={order.paymentStatus} /> },
                  { key: "total", header: "Total", align: "end", render: (order) => formatPrice(order.total, order.currency) },
                ]}
              />
            </AdminCard>
            <AdminCard title="Addresses">
              {addresses.length === 0 ? <p className="text-16 text-subtle-foreground">No saved addresses.</p> : null}
              <ul className="grid gap-3 sm:grid-cols-2">
                {addresses.map((address) => (
                  <li key={address.id} className="rounded-md border border-border p-3 text-16">
                    <p className="font-semibold">
                      {address.fullName} {address.isDefault ? <StatusPill tone="neutral">Default</StatusPill> : null}
                    </p>
                    <p className="text-14 text-subtle-foreground">{[address.line1, address.line2, address.city, address.province, address.postalCode].filter(Boolean).join(", ")}</p>
                    <p className="text-14">{address.phone}</p>
                  </li>
                ))}
              </ul>
            </AdminCard>
          </>
        }
        side={
          <>
            <AdminCard title="Contact" description={detail.piiMasked ? "Contact details are hidden for your role." : undefined}>
              <dl className="flex flex-col gap-2 text-16">
                <div>
                  <dt className="text-14 text-subtle-foreground">Email</dt>
                  <dd className="break-all">{customer.email}</dd>
                </div>
                <div>
                  <dt className="text-14 text-subtle-foreground">Phone</dt>
                  <dd>{customer.phone ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-14 text-subtle-foreground">Marketing emails</dt>
                  <dd>{customer.marketingOptIn ? "Agreed" : "Not agreed"}</dd>
                </div>
              </dl>
              {canOrders && stats.lastOrderAt ? (
                <Link prefetch={false} href={`/admin/orders?q=${encodeURIComponent(detail.piiMasked ? customer.fullName : customer.email)}`} className="text-14 font-semibold underline underline-offset-4">
                  Search their orders
                </Link>
              ) : null}
            </AdminCard>
            <AdminCard title="Actions">
              <CustomerActions
                id={customer.id}
                fullName={customer.fullName}
                phone={customer.phone}
                email={customer.email}
                group={customer.group}
                marketingOptIn={customer.marketingOptIn}
                can={{ write: can(staff, "customers:write"), pii: can(staff, "customers:read_pii"), export: can(staff, "customers:export"), erase: can(staff, "customers:delete") }}
              />
            </AdminCard>
          </>
        }
      />
    </>
  )
}
