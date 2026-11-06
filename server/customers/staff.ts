import "server-only"

import type { Permission } from "@/server/admin/permissions"
import type { RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import type { CustomerQuery, CustomerRepository } from "@/server/customers/repository"
import type { Customer, CustomerAddress, CustomerGroup } from "@/server/customers/types"
import type { Order } from "@/server/orders/types"
import { DomainError } from "@/server/shared/errors"
import { now } from "@/server/shared/ids"

/**
 * Staff customer operations (admin A4). Contact details (email, phone, addresses) are masked for
 * staff without `customers:read_pii`; exports and erasure are sensitive (step-up, A-003) and
 * always audited. Erasure is the same path as a customer deleting their own account.
 */

type Audit = (staff: StaffContext, meta: RequestMeta, entry: { action: string; entity: string; entityId: string; before?: unknown; after?: unknown; reason?: string | null; storeId: string }) => Promise<void>

type Deps = {
  customers: CustomerRepository
  orders: { listForCustomer: (storeId: string, customerId: string) => Promise<Order[]>; anonymiseCustomer: (customerId: string) => Promise<number> }
  audit: Audit
  assertSteppedUp: (staff: StaffContext) => void
}

const need = (staff: StaffContext, permission: Permission) => {
  if (!staff.permissions.includes(permission)) throw new DomainError("forbidden", "You don't have permission to do that.", { permission })
}

const maskEmail = (email: string) => {
  const [name, domain] = email.split("@")
  return domain ? `${name.slice(0, 1)}•••@${domain}` : "•••"
}
const maskPhone = (phone: string | null) => (phone ? `•••${phone.replace(/\D/g, "").slice(-3)}` : null)

export type StaffCustomerRow = { id: string; fullName: string; email: string; phone: string | null; group: CustomerGroup; marketingOptIn: boolean; createdAt: string; deletionRequested: boolean }

export type StaffCustomerDetail = {
  customer: StaffCustomerRow
  addresses: CustomerAddress[]
  orders: { number: string; placedAt: string; status: Order["status"]; paymentStatus: Order["paymentStatus"]; total: number; currency: Order["currency"] }[]
  stats: { orders: number; spent: number; refunded: number; firstOrderAt: string | null; lastOrderAt: string | null }
  piiMasked: boolean
}

function row(customer: Customer, pii: boolean): StaffCustomerRow {
  return {
    id: customer.id,
    fullName: customer.fullName,
    email: pii ? customer.email : maskEmail(customer.email),
    phone: pii ? customer.phone : maskPhone(customer.phone),
    group: customer.group,
    marketingOptIn: customer.marketingOptIn,
    createdAt: customer.createdAt,
    deletionRequested: customer.deletionRequestedAt !== null,
  }
}

export function createStaffCustomers(deps: Deps) {
  const { customers } = deps

  async function load(staff: StaffContext, id: string) {
    const customer = await customers.findById(id)
    if (!customer || customer.storeId !== staff.member.storeId || customer.email.endsWith("@invalid")) throw new DomainError("not_found", "Customer not found.")
    return customer
  }

  return {
    async list(staff: StaffContext, query: CustomerQuery) {
      need(staff, "customers:read")
      const pii = staff.permissions.includes("customers:read_pii")
      const page = await customers.search(staff.member.storeId, query)
      return { rows: page.customers.map((customer) => row(customer, pii)), total: page.total }
    },

    async detail(staff: StaffContext, id: string): Promise<StaffCustomerDetail> {
      need(staff, "customers:read")
      const customer = await load(staff, id)
      const pii = staff.permissions.includes("customers:read_pii")
      const [addresses, orders] = await Promise.all([customers.listAddresses(customer.id), deps.orders.listForCustomer(customer.storeId, customer.id)])
      const counted = orders.filter((order) => order.status !== "cancelled")
      return {
        customer: row(customer, pii),
        addresses: pii ? addresses : addresses.map((address) => ({ ...address, fullName: address.fullName.split(" ")[0] ?? "", phone: maskPhone(address.phone) ?? "", line1: "•••", line2: address.line2 ? "•••" : undefined, postalCode: address.postalCode ? "•••" : undefined })),
        orders: orders.map((order) => ({ number: order.number, placedAt: order.placedAt, status: order.status, paymentStatus: order.paymentStatus, total: order.total, currency: order.currency })),
        stats: {
          orders: counted.length,
          spent: counted.reduce((sum, order) => sum + order.total, 0),
          refunded: orders.reduce((sum, order) => sum + order.refundedTotal, 0),
          firstOrderAt: orders.at(-1)?.placedAt ?? null,
          lastOrderAt: orders[0]?.placedAt ?? null,
        },
        piiMasked: !pii,
      }
    },

    /** Name, phone, price group and marketing consent. Moving to wholesale changes the prices they see. */
    async update(staff: StaffContext, meta: RequestMeta, id: string, changes: { fullName?: string; phone?: string | null; group?: CustomerGroup; marketingOptIn?: boolean }, reason: string | null) {
      need(staff, "customers:write")
      if ((changes.phone !== undefined || changes.fullName !== undefined) && !staff.permissions.includes("customers:read_pii")) need(staff, "customers:read_pii")
      const before = await load(staff, id)
      const after = await customers.update(id, changes)
      const keys = (Object.keys(changes) as (keyof typeof changes)[]).filter((key) => before[key] !== after[key])
      await deps.audit(staff, meta, {
        action: "customer.updated",
        entity: "customer",
        entityId: id,
        before: Object.fromEntries(keys.map((key) => [key, before[key]])),
        after: Object.fromEntries(keys.map((key) => [key, after[key]])),
        reason,
        storeId: staff.member.storeId,
      })
      return row(after, staff.permissions.includes("customers:read_pii"))
    },

    /** Signs the customer out on every device (lost phone, shared computer). */
    async signOut(staff: StaffContext, meta: RequestMeta, id: string) {
      need(staff, "customers:write")
      await load(staff, id)
      await customers.deleteSessionsFor(id)
      await deps.audit(staff, meta, { action: "customer.signed_out", entity: "customer", entityId: id, storeId: staff.member.storeId })
    },

    /** Right of access, on the customer's behalf: everything held about them, as JSON. */
    async exportData(staff: StaffContext, meta: RequestMeta, id: string, reason: string) {
      need(staff, "customers:export")
      deps.assertSteppedUp(staff)
      const customer = await load(staff, id)
      const [addresses, orders] = await Promise.all([customers.listAddresses(id), deps.orders.listForCustomer(customer.storeId, id)])
      await deps.audit(staff, meta, { action: "customer.exported", entity: "customer", entityId: id, after: { orders: orders.length, addresses: addresses.length }, reason, storeId: staff.member.storeId })
      return {
        exportedAt: now(),
        exportedBy: staff.member.email,
        profile: { id: customer.id, email: customer.email, fullName: customer.fullName, phone: customer.phone, group: customer.group, marketingOptIn: customer.marketingOptIn, createdAt: customer.createdAt },
        addresses,
        orders: orders.map(({ accessTokenHash: _hidden, idempotencyKey: _key, ...order }) => order),
      }
    },

    /** Right to erasure: anonymise their orders (amounts stay for the books), scrub the profile, end sessions. */
    async erase(staff: StaffContext, meta: RequestMeta, id: string, reason: string) {
      need(staff, "customers:delete")
      deps.assertSteppedUp(staff)
      const customer = await load(staff, id)
      const orders = await deps.orders.anonymiseCustomer(id)
      await customers.scrub(id)
      await customers.deleteSessionsFor(id)
      await deps.audit(staff, meta, { action: "customer.erased", entity: "customer", entityId: id, before: { createdAt: customer.createdAt }, after: { ordersAnonymised: orders }, reason, storeId: staff.member.storeId })
    },
  }
}

export type StaffCustomers = ReturnType<typeof createStaffCustomers>
