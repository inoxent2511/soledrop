// SWAP → none: talks to the real BFF (`app/api/admin/orders/*`).
import { request } from "@/api/http"
import type { OrderStatus } from "@/server/orders/types"

const base = (number: string) => `/api/admin/orders/${encodeURIComponent(number)}`

export const adminOrdersApi = {
  transition: (number: string, input: { to: OrderStatus; note?: string; trackingNumber?: string; reason?: string | null; expectedUpdatedAt?: string }) =>
    request<{ status: OrderStatus; updatedAt: string }>(`${base(number)}/transition`, { method: "POST", body: input }),
  markPaid: (number: string, input: { provider: "cod" | "bank_transfer"; amount: number; reference?: string; idempotencyKey: string }) =>
    request<{ payment: { id: string } }>(`${base(number)}/payments`, { method: "POST", body: input }),
  refund: (number: string, input: { amount: number; reason: string; lines: { orderLineId: string; quantity: number }[]; restock: boolean; idempotencyKey: string }) =>
    request<{ refund: { id: string } }>(`${base(number)}/refunds`, { method: "POST", body: input }),
  decideReturn: (number: string, returnId: string, input: { decision: "approved" | "rejected" | "received"; reason?: string | null }) =>
    request<{ return: { id: string; status: string } }>(`${base(number)}/returns/${encodeURIComponent(returnId)}`, { method: "POST", body: input }),
  addNote: (number: string, body: string) => request<{ note: { id: string } }>(`${base(number)}/notes`, { method: "POST", body: { body } }),
}
