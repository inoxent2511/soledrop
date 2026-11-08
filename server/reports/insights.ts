import "server-only"

import { ADMIN_MODULES } from "@/features/admin/modules"
import type { StaffContext } from "@/server/admin/types"
import type { StaffCatalog } from "@/server/catalog/staff"
import type { StaffCustomers } from "@/server/customers/staff"
import type { StaffOrders } from "@/server/orders/staff"
import type { PlatformOperations } from "@/server/platform/repository"

/**
 * What needs attention (the notification centre and the dashboard) and the command palette's
 * search, both through the staff services so each item respects the member's permissions.
 */

export type AttentionItem = { key: string; label: string; count: number; href: string; tone: "pending" | "danger" | "info" }
export type CommandResult = { group: "Pages" | "Orders" | "Products" | "Customers"; label: string; detail?: string; href: string }

type Deps = { orders: StaffOrders; catalog: StaffCatalog; customers: StaffCustomers; platform: PlatformOperations }

const has = (staff: StaffContext, permission: string) => staff.permissions.includes(permission as never)

export function createInsights(deps: Deps) {
  return {
    async attention(staff: StaffContext): Promise<AttentionItem[]> {
      const items: AttentionItem[] = []
      const tasks: Promise<void>[] = []
      if (has(staff, "orders:read")) {
        tasks.push(
          deps.orders.list(staff, { status: ["confirmed", "processing"], page: 1, pageSize: 1 }).then(({ total }) => {
            if (total) items.push({ key: "to-pack", label: total === 1 ? "order to pack" : "orders to pack", count: total, href: "/admin/orders?view=to-pack", tone: "info" })
          }),
        )
      }
      if (has(staff, "payments:read")) {
        tasks.push(
          deps.orders.paymentsOverview(staff).then(({ queue }) => {
            if (queue.length) items.push({ key: "bank-transfers", label: queue.length === 1 ? "bank transfer to match" : "bank transfers to match", count: queue.length, href: "/admin/payments", tone: queue.some((row) => row.waitingHours >= 48) ? "danger" : "pending" })
          }),
        )
      }
      if (has(staff, "inventory:read")) {
        tasks.push(
          deps.catalog.stock(staff, { low: 0, page: 1, pageSize: 1 }).then(({ total }) => {
            if (total) items.push({ key: "sold-out", label: total === 1 ? "size sold out" : "sizes sold out", count: total, href: "/admin/inventory?view=out", tone: "pending" })
          }),
        )
      }
      if (has(staff, "settings:read")) {
        tasks.push(
          deps.platform.outboxSummary(staff.member.storeId).then(({ failed }) => {
            if (failed) items.push({ key: "failed-events", label: failed === 1 ? "email or webhook failed" : "emails or webhooks failed", count: failed, href: "/admin/settings?view=outbox", tone: "danger" })
          }),
        )
      }
      await Promise.all(tasks)
      const order = ["bank-transfers", "to-pack", "failed-events", "sold-out"]
      return items.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    },

    /** Modules, orders, products and customers matching `q`, limited to what the member may see. */
    async command(staff: StaffContext, q: string): Promise<CommandResult[]> {
      const term = q.trim().toLowerCase()
      const pages: CommandResult[] = ADMIN_MODULES.filter((module) => has(staff, module.permission))
        .filter((module) => !term || [module.label, ...(module.keywords ?? [])].some((word) => word.toLowerCase().includes(term)))
        .map((module) => ({ group: "Pages", label: module.label, href: module.href }))
      if (term.length < 2) return pages.slice(0, 8)
      const [orders, products, customers] = await Promise.all([
        has(staff, "orders:read") ? deps.orders.list(staff, { q: term, page: 1, pageSize: 5 }).then(({ orders }) => orders) : Promise.resolve([]),
        has(staff, "products:read") ? deps.catalog.listProducts(staff, { q: term, page: 1, pageSize: 5 }).then(({ rows }) => rows) : Promise.resolve([]),
        has(staff, "customers:read") ? deps.customers.list(staff, { q: term, page: 1, pageSize: 5 }).then(({ rows }) => rows) : Promise.resolve([]),
      ])
      return [
        ...pages.slice(0, 5),
        ...orders.map((order): CommandResult => ({ group: "Orders", label: order.number, detail: `${order.customer} · ${order.status.replace("_", " ")}`, href: `/admin/orders/${order.number}` })),
        ...products.map((product): CommandResult => ({ group: "Products", label: `${product.brand} ${product.title}`, detail: product.status, href: `/admin/products/${product.id}` })),
        ...customers.map((customer): CommandResult => ({ group: "Customers", label: customer.fullName, detail: customer.email, href: `/admin/customers/${customer.id}` })),
      ]
    },
  }
}
