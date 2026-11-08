import type { ActorScoped } from "@/server/db/actor"
import type { RefundInput, RefundIntent } from "./refund-intent"
import type { Refund } from "./types"

export interface RefundIntentOperations {
  pending(limit: number): Promise<RefundIntent[]>
  find(id: string): Promise<RefundIntent | null>
  prepare(input: RefundInput): Promise<{ intent: RefundIntent | null; refund: Refund | null }>
  confirm(id: string, providerRefundRef: string | null): Promise<void>
}
export type RefundIntentRepository = ActorScoped<RefundIntentOperations>
