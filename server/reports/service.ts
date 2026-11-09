import "server-only"

import type { Permission } from "@/server/admin/permissions"
import type { RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import type { Product } from "@/server/catalog/types"
import { toCsv } from "@/server/import-export/csv"
import type { StockLevelRow } from "@/server/inventory/repository"
import type { OrderQuery, SalesOrder, SalesOrderPage } from "@/server/orders/types"
import type { PriceList, PriceRow } from "@/server/pricing/types"
import { DomainError } from "@/server/shared/errors"

/**
 * Reports (admin A8), computed from orders, the catalogue, stock and prices through their
 * services. Days are Pakistan days (UTC+5). Cancelled orders count separately and never in sales.
 * Net sales = order totals − refunds. Fine for this catalogue's size; a SQL view can replace the
 * scan without changing these shapes (docs/app/phase-2.md).
 */

type Audit = (staff: StaffContext, meta: RequestMeta, entry: { action: string; entity: string; entityId: string; after?: unknown; storeId: string }) => Promise<void>

type Deps = {
  orders: { search: (storeId: string, query: OrderQuery) => Promise<SalesOrderPage> }
  products: (storeId: string) => Promise<Product[]>
  levels: (variantIds: string[]) => Promise<StockLevelRow[]>
  pricing: { priceLists: (storeId: string) => Promise<PriceList[]>; rawPrices: (variantIds: string[]) => Promise<PriceRow[]> }
  audit: Audit
}

const need = (staff: StaffContext, permission: Permission) => {
  if (!staff.permissions.includes(permission)) throw new DomainError("forbidden", "You don't have permission to do that.", { permission })
}

/** "2026-11-12" in Pakistan for an ISO instant. */
export const pkDay = (iso: string) => new Date(Date.parse(iso) + 5 * 3_600_000).toISOString().slice(0, 10)
const dayStart = (day: string) => new Date(`${day}T00:00:00+05:00`).toISOString()
const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

export type SalesDay = { day: string; orders: number; items: number; gross: number; refunds: number; net: number; cancelled: number }

export function createReports(deps: Deps) {
  async function* ordersIn(storeId: string, from: string, to: string): AsyncGenerator<SalesOrder> {
    let seen = 0
    for (let page = 1; ; page++) {
      const result = await deps.orders.search(storeId, { placedFrom: dayStart(from), placedTo: dayStart(addDays(to, 1)), sort: "placed_asc", page, pageSize: 1000 })
      yield* result.orders
      seen += result.orders.length
      if (seen >= result.total || result.orders.length === 0) return
    }
  }

  async function sales(staff: StaffContext, from: string, to: string) {
    need(staff, "reports:read")
    if (from > to) throw new DomainError("validation", "The start date is after the end date.")
    if (Date.parse(to) - Date.parse(from) > 366 * 86_400_000) throw new DomainError("validation", "Reports cover up to a year at a time.")
    const days = new Map<string, SalesDay>()
    for (let day = from; day <= to; day = addDays(day, 1)) days.set(day, { day, orders: 0, items: 0, gross: 0, refunds: 0, net: 0, cancelled: 0 })
    const methods = new Map<string, { orders: number; total: number }>()
    const kinds = { new: 0, preloved: 0 }
    const products = new Map<string, { title: string; units: number; revenue: number }>()
    const codes = new Map<string, number>()
    for await (const order of ordersIn(staff.member.storeId, from, to)) {
      const row = days.get(pkDay(order.placedAt))
      if (!row) continue
      if (order.status === "cancelled") {
        row.cancelled += 1
        continue
      }
      row.orders += 1
      row.gross += order.total
      row.refunds += order.refundedTotal
      row.net += order.total - order.refundedTotal
      row.items += order.lines.reduce((sum, line) => sum + line.quantity, 0)
      const method = methods.get(order.paymentMethod) ?? { orders: 0, total: 0 }
      methods.set(order.paymentMethod, { orders: method.orders + 1, total: method.total + order.total })
      for (const code of order.promotionCodes) codes.set(code, (codes.get(code) ?? 0) + 1)
      for (const line of order.lines) {
        kinds[line.kind] += line.total
        const product = products.get(line.productId) ?? { title: `${line.brand} ${line.title}`, units: 0, revenue: 0 }
        products.set(line.productId, { ...product, units: product.units + line.quantity, revenue: product.revenue + line.total })
      }
    }
    const rows = [...days.values()]
    const totals = rows.reduce((sum, row) => ({ orders: sum.orders + row.orders, items: sum.items + row.items, gross: sum.gross + row.gross, refunds: sum.refunds + row.refunds, net: sum.net + row.net, cancelled: sum.cancelled + row.cancelled }), { orders: 0, items: 0, gross: 0, refunds: 0, net: 0, cancelled: 0 })
    return {
      from,
      to,
      days: rows,
      totals: { ...totals, averageOrder: totals.orders ? Math.round(totals.gross / totals.orders) : 0 },
      methods: [...methods].map(([method, value]) => ({ method, ...value })).sort((a, b) => b.total - a.total),
      kinds,
      topProducts: [...products].map(([productId, value]) => ({ productId, ...value })).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      promotionCodes: [...codes].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
    }
  }

  return {
    sales,

    /** What the stock on hand is worth at base prices, and how many sizes are sold out. */
    async inventoryValue(staff: StaffContext) {
      need(staff, "reports:read")
      const products = (await deps.products(staff.member.storeId)).filter((product) => product.status !== "archived")
      const variantIds = products.flatMap((product) => product.variants.map((variant) => variant.id))
      const [levels, lists, prices] = await Promise.all([deps.levels(variantIds), deps.pricing.priceLists(staff.member.storeId), deps.pricing.rawPrices(variantIds)])
      const base = lists.filter((list) => list.customerGroup === null).sort((a, b) => a.priority - b.priority)[0]
      const price = new Map(prices.filter((row) => row.priceListId === base?.id).map((row) => [row.variantId, row.amount]))
      const onHand = new Map(levels.map((row) => [row.variantId, row.onHand]))
      let value = 0
      let units = 0
      let soldOut = 0
      const byKind = { new: 0, preloved: 0 }
      for (const product of products) {
        for (const variant of product.variants) {
          const count = onHand.get(variant.id) ?? 0
          if (count === 0) soldOut += 1
          units += count
          const worth = count * (price.get(variant.id) ?? 0)
          value += worth
          byKind[product.kind] += worth
        }
      }
      return { value, units, sizes: variantIds.length, soldOut, byKind }
    },

    /** The sales-by-day table as CSV (formula-safe, audited). */
    async exportSales(staff: StaffContext, meta: RequestMeta, from: string, to: string) {
      need(staff, "reports:export")
      const report = await sales(staff, from, to)
      await deps.audit(staff, meta, { action: "report.exported", entity: "report", entityId: "sales", after: { from, to }, storeId: staff.member.storeId })
      const money = (minor: number) => (minor / 100).toFixed(2)
      return toCsv(
        ["day", "orders", "items", "gross", "refunds", "net", "cancelled"],
        report.days.map((row) => ({ day: row.day, orders: row.orders, items: row.items, gross: money(row.gross), refunds: money(row.refunds), net: money(row.net), cancelled: row.cancelled })),
      )
    },
  }
}

export type Reports = ReturnType<typeof createReports>
