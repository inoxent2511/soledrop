import "server-only"

import type { Permission } from "@/server/admin/permissions"
import type { RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import type { CartRepository } from "@/server/cart/repository"
import type { Product } from "@/server/catalog/types"
import type { ContentRepository } from "@/server/content/repository"
import type { Customer } from "@/server/customers/types"
import { toCsv } from "@/server/import-export/csv"
import type { PriceList, PriceRow } from "@/server/pricing/types"
import { DomainError } from "@/server/shared/errors"

/**
 * Staff marketing (admin A8): the newsletter list (export is sensitive: step-up, reason, audit)
 * and abandoned bags, valued at base prices. Contact details are masked without customers:read_pii.
 */

type Audit = (staff: StaffContext, meta: RequestMeta, entry: { action: string; entity: string; entityId: string; before?: unknown; after?: unknown; reason?: string | null; storeId: string }) => Promise<void>

type Deps = {
  content: ContentRepository
  carts: CartRepository
  products: (variantIds: string[]) => Promise<Product[]>
  customer: (id: string) => Promise<Customer | null>
  pricing: { priceLists: (storeId: string) => Promise<PriceList[]>; rawPrices: (variantIds: string[]) => Promise<PriceRow[]> }
  audit: Audit
  assertSteppedUp: (staff: StaffContext) => void
}

const need = (staff: StaffContext, permission: Permission) => {
  if (!staff.permissions.includes(permission)) throw new DomainError("forbidden", "You don't have permission to do that.", { permission })
}
const maskEmail = (email: string) => `${email.slice(0, 1)}•••@${email.split("@")[1] ?? ""}`

export function createStaffMarketing(deps: Deps) {
  return {
    async subscribers(staff: StaffContext, query: { status?: "subscribed" | "unsubscribed"; page: number; pageSize: number }) {
      need(staff, "marketing:read")
      const pii = staff.permissions.includes("customers:read_pii")
      const page = await deps.content.listSubscribers(staff.member.storeId, query)
      return { total: page.total, rows: page.subscribers.map((row) => ({ ...row, email: pii ? row.email : maskEmail(row.email) })) }
    },

    /** Every subscribed address as CSV, for the email tool; sensitive (A-003), so audited with a reason. */
    async exportSubscribers(staff: StaffContext, meta: RequestMeta, reason: string) {
      need(staff, "marketing:export")
      deps.assertSteppedUp(staff)
      const { subscribers } = await deps.content.listSubscribers(staff.member.storeId, { status: "subscribed", page: 1, pageSize: 100_000 })
      await deps.audit(staff, meta, { action: "newsletter.exported", entity: "newsletter", entityId: "*", after: { rows: subscribers.length }, reason, storeId: staff.member.storeId })
      return toCsv(["email", "source", "consent_at"], subscribers.map((row) => ({ email: row.email, source: row.source, consent_at: row.consentAt })))
    },

    /** Bags with something in them, untouched for `olderThanHours`, newest first, valued at base prices. */
    async abandoned(staff: StaffContext, query: { olderThanHours: number; page: number; pageSize: number }) {
      need(staff, "marketing:read")
      const page = await deps.carts.listAbandoned(staff.member.storeId, query)
      const variantIds = [...new Set(page.carts.flatMap((cart) => cart.lines.map((line) => line.variantId)))]
      const [products, lists, prices] = await Promise.all([deps.products(variantIds), deps.pricing.priceLists(staff.member.storeId), deps.pricing.rawPrices(variantIds)])
      const base = lists.filter((list) => list.customerGroup === null).sort((a, b) => a.priority - b.priority)[0]
      const pii = staff.permissions.includes("customers:read_pii")
      const rows = await Promise.all(
        page.carts.map(async (cart) => {
          const customer = cart.customerId ? await deps.customer(cart.customerId) : null
          const items = cart.lines.map((line) => {
            const product = products.find((entry) => entry.variants.some((variant) => variant.id === line.variantId))
            const variant = product?.variants.find((entry) => entry.id === line.variantId)
            const price = prices.find((row) => row.variantId === line.variantId && row.priceListId === base?.id)?.amount ?? 0
            return { title: product ? `${product.brand.name} ${product.title}` : "Removed product", size: variant ? `UK ${variant.size.uk}` : "", quantity: line.quantity, value: price * line.quantity }
          })
          return {
            id: cart.id,
            updatedAt: cart.updatedAt,
            customer: customer ? { name: customer.fullName, email: pii ? customer.email : maskEmail(customer.email) } : null,
            items,
            value: items.reduce((sum, item) => sum + item.value, 0),
          }
        }),
      )
      return { rows, total: page.total }
    },
  }
}
