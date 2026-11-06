import { z } from "zod"

import { ORDER_SORTS, ORDER_STATUSES, type OrderQuery, type OrderStatus, type PaymentStatus } from "@/server/orders/types"

/**
 * The orders list's URL state (filters, sort, page), parsed the same way by the page, the list API
 * and the CSV export. Unknown or malformed values fall back to defaults instead of erroring.
 */
export const PAYMENT_STATUSES = ["unpaid", "authorized", "paid", "partially_refunded", "refunded", "failed"] as const satisfies readonly PaymentStatus[]
export const PAGE_SIZES = [25, 50, 100] as const

/** Quick views: the tabs above the list. */
export const ORDER_VIEWS: { key: string; label: string; status: OrderStatus[] }[] = [
  { key: "all", label: "All", status: [] },
  { key: "to-pack", label: "To pack", status: ["confirmed", "processing"] },
  { key: "awaiting-payment", label: "Awaiting payment", status: ["pending_payment"] },
  { key: "shipped", label: "Shipped", status: ["shipped"] },
  { key: "done", label: "Delivered", status: ["delivered"] },
  { key: "closed", label: "Cancelled & returned", status: ["cancelled", "returned"] },
]

const list = <T extends string>(values: readonly T[]) =>
  z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",").filter((entry): entry is T => (values as readonly string[]).includes(entry)) : []))

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined)

const schema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  view: z.string().optional().catch(undefined),
  status: list(ORDER_STATUSES).catch([]),
  payment: list(PAYMENT_STATUSES).catch([]),
  method: z.enum(["cod", "bank_transfer", "card"]).optional().catch(undefined),
  from: day,
  to: day,
  sort: z.enum(ORDER_SORTS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  size: z.coerce
    .number()
    .refine((value) => (PAGE_SIZES as readonly number[]).includes(value))
    .catch(25),
})

export type OrderListParams = z.infer<typeof schema>

export function parseOrderParams(input: URLSearchParams | Record<string, string | string[] | undefined>): OrderListParams {
  const entries = input instanceof URLSearchParams ? Object.fromEntries(input) : Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))
  return schema.parse({ page: 1, size: 25, ...entries })
}

/** Dates are whole days in Pakistan time (UTC+5): `to` includes that day. */
const startOfDayPk = (value: string) => new Date(`${value}T00:00:00+05:00`).toISOString()
const nextDayPk = (value: string) => new Date(Date.parse(`${value}T00:00:00+05:00`) + 86_400_000).toISOString()

export function toOrderQuery(params: OrderListParams): OrderQuery {
  const view = ORDER_VIEWS.find((entry) => entry.key === params.view)
  return {
    q: params.q || undefined,
    status: params.status.length ? params.status : view?.status,
    paymentStatus: params.payment.length ? params.payment : undefined,
    paymentMethod: params.method,
    placedFrom: params.from ? startOfDayPk(params.from) : undefined,
    placedTo: params.to ? nextDayPk(params.to) : undefined,
    sort: params.sort,
    page: params.page,
    pageSize: params.size,
  }
}
