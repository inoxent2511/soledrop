import type { ConditionGrade, ProductKind } from "@/server/catalog/types"
import type { CurrencyCode } from "@/server/shared/money"

export const ORDER_STATUSES = [
  "pending_payment",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export type PaymentStatus = "unpaid" | "authorized" | "paid" | "partially_refunded" | "refunded" | "failed"
export type FulfillmentStatus = "unfulfilled" | "fulfilled" | "returned"

export type Address = {
  fullName: string
  phone: string
  line1: string
  line2?: string
  city: string
  province: string
  postalCode?: string
  country: string
}

export type OrderLine = {
  id: string
  variantId: string
  productId: string
  slug: string
  title: string
  brand: string
  kind: ProductKind
  condition: ConditionGrade | null
  size: { eu: string; uk: string; us: string }
  imageUrl: string
  sku: string
  quantity: number
  unitPrice: number
  compareAt: number | null
  /** Share of order-level discounts, allocated so the lines sum exactly to the order discount. */
  discount: number
  tax: number
  total: number
  refundedQuantity: number
}

export type OrderHistoryEntry = { from: OrderStatus | null; to: OrderStatus; at: string; actor: string; note?: string }

export type Order = {
  id: string
  storeId: string
  number: string
  customerId: string | null
  email: string
  phone: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  fulfillmentStatus: FulfillmentStatus
  currency: CurrencyCode
  lines: OrderLine[]
  subtotal: number
  discountTotal: number
  shippingTotal: number
  taxTotal: number
  taxIncluded: boolean
  total: number
  refundedTotal: number
  promotionCodes: string[]
  shippingAddress: Address
  shippingMethod: { code: string; label: string; amount: number; minDays: number; maxDays: number }
  paymentMethod: string
  idempotencyKey: string
  /** Lets a guest view their order from the confirmation link; stored hashed. */
  accessTokenHash: string
  customFields: Record<string, string | number | boolean>
  note: string | null
  trackingNumber: string | null
  history: OrderHistoryEntry[]
  placedAt: string
  updatedAt: string
}

export type Payment = {
  id: string
  orderId: string
  provider: string
  status: "pending" | "authorized" | "captured" | "failed" | "refunded" | "partially_refunded"
  amount: number
  refundedAmount: number
  currency: CurrencyCode
  providerRef: string | null
  idempotencyKey: string
  createdAt: string
}

export type Refund = {
  id: string
  orderId: string
  paymentId: string | null
  amount: number
  reason: string
  lines: { orderLineId: string; quantity: number }[]
  restock: boolean
  idempotencyKey: string
  createdAt: string
}

export type ReturnRequest = {
  id: string
  orderId: string
  status: "requested" | "approved" | "received" | "rejected"
  lines: { orderLineId: string; quantity: number }[]
  reason: string
  createdAt: string
}

/** A staff-only note on an order (admin A2); shoppers never see these. */
export type OrderNote = { id: string; orderId: string; author: string; authorName: string; body: string; createdAt: string }

export const ORDER_SORTS = ["placed_desc", "placed_asc", "total_desc", "total_asc"] as const
export type OrderSort = (typeof ORDER_SORTS)[number]

/** Staff order search (admin list): every filter optional, newest first by default. */
export type OrderQuery = {
  q?: string
  status?: OrderStatus[]
  paymentStatus?: PaymentStatus[]
  paymentMethod?: string
  placedFrom?: string
  placedTo?: string
  sort?: OrderSort
  page: number
  pageSize: number
}

export type OrderPage = { orders: Order[]; total: number }

/** Financial reporting excludes customer identities, addresses, notes and access proofs. */
export type SalesOrder = Pick<Order, "placedAt" | "status" | "total" | "refundedTotal" | "paymentMethod" | "promotionCodes"> & { lines: Pick<OrderLine, "productId" | "title" | "brand" | "kind" | "quantity" | "total">[] }
export type SalesOrderPage = { orders: SalesOrder[]; total: number }
export type SalesOrderQuery = Pick<OrderQuery, "placedFrom" | "placedTo" | "page" | "pageSize">
