import "server-only"

import { serverSiteUrl } from "@/lib/site-server"
import { currentStoreId } from "@/server/db/driver"
import { toOrderDto } from "@/server/http/dto"
import { currentCustomer } from "@/server/http/route"
import { orderService } from "@/server/orders"

/**
 * An order for the order page: visible to the signed-in owner or to whoever holds the
 * confirmation-link token (same rule as GET /api/orders/[number]); null otherwise.
 */
export async function orderPageData(number: string, token: string | null) {
  const customer = await currentCustomer()
  const service = orderService()
  const order = await service.findForViewer(currentStoreId(), number.toUpperCase(), { customerId: customer?.id ?? null, token })
  if (!order) return null
  const next = token ? await service.nextStepFor(order, token, (value) => `${serverSiteUrl()}/orders/${value}`) : { type: "none" as const }
  return { order: toOrderDto(order, await service.listReturns(order.id)), next }
}
