import type { ActorScoped } from "@/server/db/actor"
import type { EventTopic } from "@/server/platform/types"

/** One line of the money ledger: a payment or a refund, with its order. */
export type LedgerRow = { id: string; orderNumber: string; provider: string | null; status: string; amount: number; currency: string; reference: string | null; reason: string | null; at: string }
import type { Order, OrderNote, OrderPage, OrderQuery, OrderStatus, Payment, Refund, ReturnRequest, SalesOrderPage, SalesOrderQuery } from "@/server/orders/types"

/** A fully priced order ready to persist; everything here was computed on the server. */
export type OrderDraft = Omit<Order, "id" | "number" | "history" | "placedAt" | "updatedAt" | "refundedTotal">

export type PlaceOrderInput = {
  draft: OrderDraft
  cartId: string
  promotionIds: string[]
  event: { topic: EventTopic; payload: Record<string, unknown> }
}

export interface OrderOperations {
  /**
   * place_order: in one transaction — replay by idempotency key, lock and decrement stock
   * (never below zero), release the cart's reservations, redeem promotions within their
   * limits, allocate the order number, convert the cart and write the outbox event.
   */
  placeOrder(input: PlaceOrderInput): Promise<{ order: Order; replayed: boolean }>
  findByNumber(storeId: string, number: string): Promise<Order | null>
  findById(id: string): Promise<Order | null>
  findByIdempotencyKey(storeId: string, key: string): Promise<Order | null>
  listByCustomer(storeId: string, customerId: string): Promise<Order[]>
  listByEmail(storeId: string, email: string): Promise<Order[]>
  /** transition_order: validates the state machine, restocks on cancellation, appends history. */
  transition(orderId: string, to: OrderStatus, actor: string, note?: string, trackingNumber?: string, expectedUpdatedAt?: string): Promise<Order>
  /** record_payment: idempotent on (order, idempotency key); confirms a pending order when fully paid. */
  recordPayment(payment: Omit<Payment, "id" | "createdAt" | "refundedAmount">): Promise<Payment>
  listPayments(orderId: string): Promise<Payment[]>
  /** create_refund: never refunds more than was paid or more units than were bought. */
  createRefund(refund: Omit<Refund, "id" | "createdAt">): Promise<Refund>
  createReturn(request: Omit<ReturnRequest, "id" | "createdAt" | "status">): Promise<ReturnRequest>
  /** restock_return: marks a return received and puts its units back into stock. */
  restockReturn(returnId: string, actor: string): Promise<ReturnRequest>
  listReturns(orderId: string): Promise<ReturnRequest[]>
  /** next_order_number: gap-tolerant, never repeats. */
  nextOrderNumber(storeId: string): Promise<string>
  /** Staff search (admin): number, email, name or phone; filters; one page plus the total. */
  search(storeId: string, query: OrderQuery): Promise<OrderPage>
  searchSales(storeId: string, query: SalesOrderQuery): Promise<SalesOrderPage>
  listRefunds(orderId: string): Promise<Refund[]>
  /** Approves or rejects a requested return; anything else is an invalid transition. */
  decideReturn(returnId: string, decision: "approved" | "rejected", actor: string): Promise<ReturnRequest>
  addNote(note: Omit<OrderNote, "id" | "createdAt">): Promise<OrderNote>
  listNotes(orderId: string): Promise<OrderNote[]>
  /** The store-wide money ledger (admin A6): payments or refunds, newest first, with their order numbers. */
  ledger(storeId: string, query: { kind: "payments" | "refunds"; provider?: string; page: number; pageSize: number }): Promise<{ rows: LedgerRow[]; total: number }>
  /** Removes personal data from orders of a deleted customer, keeping amounts for accounting. */
  anonymiseCustomer(customerId: string): Promise<number>
}

/** Raw storage boundary; services receive explicitly bound operations. */
export type OrderRepository = ActorScoped<OrderOperations>
