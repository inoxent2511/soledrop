import "server-only"

import { searchTerm, supabase, unwrap } from "@/server/db/supabase"
import type { OrderRepository } from "@/server/orders/repository"
import type { Order, OrderLine, OrderNote, Payment, Refund, ReturnRequest } from "@/server/orders/types"
import { DomainError } from "@/server/shared/errors"

const ORDER_SELECT =
  "id, store_id, number, customer_id, email, phone, status, payment_status, fulfillment_status, currency, subtotal, discount_total, shipping_total, tax_total, tax_included, total, refunded_total, promotion_codes, shipping_address, shipping_method, payment_method, idempotency_key, access_token_hash, custom_fields, note, tracking_number, history, placed_at, updated_at, order_lines(id, variant_id, product_id, slug, title, brand, kind, condition, size, image_url, sku, quantity, unit_price, compare_at, discount, tax, total, refunded_quantity, position)"

type LineRecord = {
  id: string
  variant_id: string
  product_id: string
  slug: string
  title: string
  brand: string
  kind: OrderLine["kind"]
  condition: OrderLine["condition"]
  size: OrderLine["size"]
  image_url: string
  sku: string
  quantity: number
  unit_price: number
  compare_at: number | null
  discount: number
  tax: number
  total: number
  refunded_quantity: number
  position: number
}

type OrderRecord = {
  id: string
  store_id: string
  number: string
  customer_id: string | null
  email: string
  phone: string
  status: Order["status"]
  payment_status: Order["paymentStatus"]
  fulfillment_status: Order["fulfillmentStatus"]
  currency: Order["currency"]
  subtotal: number
  discount_total: number
  shipping_total: number
  tax_total: number
  tax_included: boolean
  total: number
  refunded_total: number
  promotion_codes: string[]
  shipping_address: Order["shippingAddress"]
  shipping_method: Order["shippingMethod"]
  payment_method: string
  idempotency_key: string
  access_token_hash: string
  custom_fields: Order["customFields"]
  note: string | null
  tracking_number: string | null
  history: Order["history"]
  placed_at: string
  updated_at: string
  order_lines: LineRecord[]
}

function toOrder(record: OrderRecord): Order {
  return {
    id: record.id,
    storeId: record.store_id,
    number: record.number,
    customerId: record.customer_id,
    email: record.email,
    phone: record.phone,
    status: record.status,
    paymentStatus: record.payment_status,
    fulfillmentStatus: record.fulfillment_status,
    currency: record.currency,
    subtotal: record.subtotal,
    discountTotal: record.discount_total,
    shippingTotal: record.shipping_total,
    taxTotal: record.tax_total,
    taxIncluded: record.tax_included,
    total: record.total,
    refundedTotal: record.refunded_total,
    promotionCodes: record.promotion_codes,
    shippingAddress: record.shipping_address,
    shippingMethod: record.shipping_method,
    paymentMethod: record.payment_method,
    idempotencyKey: record.idempotency_key,
    accessTokenHash: record.access_token_hash,
    customFields: record.custom_fields,
    note: record.note,
    trackingNumber: record.tracking_number,
    history: record.history,
    placedAt: record.placed_at,
    updatedAt: record.updated_at,
    lines: [...record.order_lines]
      .sort((a, b) => a.position - b.position)
      .map((line) => ({
        id: line.id,
        variantId: line.variant_id,
        productId: line.product_id,
        slug: line.slug,
        title: line.title,
        brand: line.brand,
        kind: line.kind,
        condition: line.condition,
        size: line.size,
        imageUrl: line.image_url,
        sku: line.sku,
        quantity: line.quantity,
        unitPrice: line.unit_price,
        compareAt: line.compare_at,
        discount: line.discount,
        tax: line.tax,
        total: line.total,
        refundedQuantity: line.refunded_quantity,
      })),
  }
}

type PaymentRecord = {
  id: string
  order_id: string
  provider: string
  status: Payment["status"]
  amount: number
  refunded_amount: number
  currency: Payment["currency"]
  provider_ref: string | null
  idempotency_key: string
  created_at: string
}

const toPayment = (row: PaymentRecord): Payment => ({
  id: row.id,
  orderId: row.order_id,
  provider: row.provider,
  status: row.status,
  amount: row.amount,
  refundedAmount: row.refunded_amount,
  currency: row.currency,
  providerRef: row.provider_ref,
  idempotencyKey: row.idempotency_key,
  createdAt: row.created_at,
})

type ReturnRecord = { id: string; order_id: string; status: ReturnRequest["status"]; lines: ReturnRequest["lines"]; reason: string; created_at: string }
const toReturn = (row: ReturnRecord): ReturnRequest => ({ id: row.id, orderId: row.order_id, status: row.status, lines: row.lines, reason: row.reason, createdAt: row.created_at })

type RefundRecord = { id: string; order_id: string; payment_id: string | null; amount: number; reason: string; lines: { order_line_id?: string; orderLineId?: string; quantity: number }[]; restock: boolean; idempotency_key: string; created_at: string }
const toRefund = (row: RefundRecord): Refund => ({
  id: row.id,
  orderId: row.order_id,
  paymentId: row.payment_id,
  amount: Number(row.amount),
  reason: row.reason,
  lines: row.lines.map((line) => ({ orderLineId: line.order_line_id ?? line.orderLineId ?? "", quantity: line.quantity })),
  restock: row.restock,
  idempotencyKey: row.idempotency_key,
  createdAt: row.created_at,
})

type NoteRecord = { id: string; order_id: string; author: string; author_name: string; body: string; created_at: string }
const toNote = (row: NoteRecord): OrderNote => ({ id: row.id, orderId: row.order_id, author: row.author, authorName: row.author_name, body: row.body, createdAt: row.created_at })

const SORT_COLUMNS = { placed_desc: ["placed_at", false], placed_asc: ["placed_at", true], total_desc: ["total", false], total_asc: ["total", true] } as const


export function createSupabaseOrderRepository(): OrderRepository {
  const byId = async (id: string) => {
    const row = unwrap(await supabase().from("orders").select(ORDER_SELECT).eq("id", id).maybeSingle()) as OrderRecord | null
    return row ? toOrder(row) : null
  }

  return {
    async placeOrder({ draft, cartId, promotionIds, event }) {
      const result = unwrap(
        await supabase().rpc("place_order", {
          p_order: {
            store_id: draft.storeId,
            customer_id: draft.customerId,
            email: draft.email,
            phone: draft.phone,
            status: draft.status,
            payment_status: draft.paymentStatus,
            fulfillment_status: draft.fulfillmentStatus,
            currency: draft.currency,
            subtotal: draft.subtotal,
            discount_total: draft.discountTotal,
            shipping_total: draft.shippingTotal,
            tax_total: draft.taxTotal,
            tax_included: draft.taxIncluded,
            total: draft.total,
            promotion_codes: draft.promotionCodes,
            shipping_address: draft.shippingAddress,
            shipping_method: draft.shippingMethod,
            payment_method: draft.paymentMethod,
            idempotency_key: draft.idempotencyKey,
            access_token_hash: draft.accessTokenHash,
            custom_fields: draft.customFields,
            note: draft.note,
            lines: draft.lines.map((line, position) => ({
              variant_id: line.variantId,
              product_id: line.productId,
              slug: line.slug,
              title: line.title,
              brand: line.brand,
              kind: line.kind,
              condition: line.condition,
              size: line.size,
              image_url: line.imageUrl,
              sku: line.sku,
              quantity: line.quantity,
              unit_price: line.unitPrice,
              compare_at: line.compareAt,
              discount: line.discount,
              tax: line.tax,
              total: line.total,
              position,
            })),
          },
          p_cart_id: cartId,
          p_promotion_ids: promotionIds,
          p_event_topic: event.topic,
          p_event_payload: event.payload,
        }),
      ) as { order_id: string; replayed: boolean }
      return { order: (await byId(result.order_id)) as Order, replayed: result.replayed }
    },
    async findByNumber(storeId, number) {
      const row = unwrap(await supabase().from("orders").select(ORDER_SELECT).eq("store_id", storeId).eq("number", number).maybeSingle()) as OrderRecord | null
      return row ? toOrder(row) : null
    },
    findById: byId,
    async findByIdempotencyKey(storeId, key) {
      const row = unwrap(await supabase().from("orders").select(ORDER_SELECT).eq("store_id", storeId).eq("idempotency_key", key).maybeSingle()) as OrderRecord | null
      return row ? toOrder(row) : null
    },
    async listByCustomer(storeId, customerId) {
      const rows = unwrap(
        await supabase().from("orders").select(ORDER_SELECT).eq("store_id", storeId).eq("customer_id", customerId).order("placed_at", { ascending: false }),
      ) as OrderRecord[]
      return rows.map(toOrder)
    },
    async listByEmail(storeId, email) {
      const rows = unwrap(await supabase().from("orders").select(ORDER_SELECT).eq("store_id", storeId).ilike("email", email)) as OrderRecord[]
      return rows.map(toOrder)
    },
    async transition(orderId, to, actor, note, trackingNumber) {
      unwrap(await supabase().rpc("transition_order", { p_order_id: orderId, p_to: to, p_actor: actor, p_note: note ?? null, p_tracking_number: trackingNumber ?? null }))
      return (await byId(orderId)) as Order
    },
    async recordPayment(payment) {
      const row = unwrap(
        await supabase().rpc("record_payment", {
          p_order_id: payment.orderId,
          p_provider: payment.provider,
          p_status: payment.status,
          p_amount: payment.amount,
          p_currency: payment.currency,
          p_provider_ref: payment.providerRef,
          p_idempotency_key: payment.idempotencyKey,
        }),
      ) as PaymentRecord
      return toPayment(row)
    },
    async listPayments(orderId) {
      const rows = unwrap(await supabase().from("payments").select("*").eq("order_id", orderId).order("created_at")) as PaymentRecord[]
      return rows.map(toPayment)
    },
    async createRefund(refund) {
      const row = unwrap(
        await supabase().rpc("create_refund", {
          p_order_id: refund.orderId,
          p_payment_id: refund.paymentId,
          p_amount: refund.amount,
          p_reason: refund.reason,
          p_lines: refund.lines.map((line) => ({ order_line_id: line.orderLineId, quantity: line.quantity })),
          p_restock: refund.restock,
          p_idempotency_key: refund.idempotencyKey,
        }),
      ) as { id: string; created_at: string }
      return { ...refund, id: row.id, createdAt: row.created_at } satisfies Refund
    },
    async createReturn(request) {
      const row = unwrap(
        await supabase().rpc("create_return", {
          p_order_id: request.orderId,
          p_lines: request.lines.map((line) => ({ order_line_id: line.orderLineId, quantity: line.quantity })),
          p_reason: request.reason,
        }),
      ) as ReturnRecord
      return toReturn(row)
    },
    async restockReturn(returnId, actor) {
      const row = unwrap(await supabase().rpc("restock_return", { p_return_id: returnId, p_actor: actor })) as ReturnRecord
      return toReturn(row)
    },
    async listReturns(orderId) {
      const rows = unwrap(await supabase().from("returns").select("*").eq("order_id", orderId)) as ReturnRecord[]
      return rows.map(toReturn)
    },
    async search(storeId, query) {
      let request = supabase().from("orders").select(ORDER_SELECT, { count: "exact" }).eq("store_id", storeId)
      const term = query.q ? searchTerm(query.q) : ""
      if (term) request = request.or(`number.ilike.*${term}*,email.ilike.*${term}*,phone.ilike.*${term}*,shipping_address->>fullName.ilike.*${term}*`)
      if (query.status?.length) request = request.in("status", query.status)
      if (query.paymentStatus?.length) request = request.in("payment_status", query.paymentStatus)
      if (query.paymentMethod) request = request.eq("payment_method", query.paymentMethod)
      if (query.placedFrom) request = request.gte("placed_at", query.placedFrom)
      if (query.placedTo) request = request.lt("placed_at", query.placedTo)
      const [column, ascending] = SORT_COLUMNS[query.sort ?? "placed_desc"]
      const start = (query.page - 1) * query.pageSize
      const result = await request.order(column, { ascending }).order("placed_at", { ascending: false }).range(start, start + query.pageSize - 1)
      const rows = unwrap(result) as OrderRecord[]
      return { orders: rows.map(toOrder), total: result.count ?? rows.length }
    },
    async listRefunds(orderId) {
      const rows = unwrap(await supabase().from("refunds").select("*").eq("order_id", orderId).order("created_at")) as RefundRecord[]
      return rows.map(toRefund)
    },
    async decideReturn(returnId, decision) {
      const row = unwrap(await supabase().from("returns").update({ status: decision }).eq("id", returnId).eq("status", "requested").select("*").maybeSingle()) as ReturnRecord | null
      if (row) return toReturn(row)
      const existing = unwrap(await supabase().from("returns").select("status").eq("id", returnId).maybeSingle()) as { status: string } | null
      if (!existing) throw new DomainError("not_found", "Return not found.")
      throw new DomainError("invalid_transition", `A return that is ${existing.status} can't be ${decision}.`)
    },
    async addNote(note) {
      const row = unwrap(await supabase().from("order_notes").insert({ order_id: note.orderId, author: note.author, author_name: note.authorName, body: note.body }).select("*").single()) as NoteRecord
      return toNote(row)
    },
    async listNotes(orderId) {
      const rows = unwrap(await supabase().from("order_notes").select("*").eq("order_id", orderId).order("created_at")) as NoteRecord[]
      return rows.map(toNote)
    },
    async nextOrderNumber(storeId) {
      return unwrap(await supabase().rpc("next_order_number", { p_store_id: storeId })) as string
    },
    async anonymiseCustomer(customerId) {
      return unwrap(await supabase().rpc("anonymise_customer_orders", { p_customer_id: customerId })) as number
    },
  }
}
