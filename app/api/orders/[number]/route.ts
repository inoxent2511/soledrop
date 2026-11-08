import { serverSiteUrl } from "@/lib/site-server"
import { currentStoreId } from "@/server/db/driver"
import { toOrderDto } from "@/server/http/dto"
import { currentCustomer, route } from "@/server/http/route"
import { orderService } from "@/server/orders"
import { DomainError } from "@/server/shared/errors"

type Context = { params: Promise<{ number: string }> }

/** Order status for its owner: signed-in customer, or anyone holding the confirmation-link token. */
export const GET = route<Context>(async (request, { params }) => {
  const { number } = await params
  const token = new URL(request.url).searchParams.get("token")
  const customer = await currentCustomer()
  const service = orderService()
  const order = await service.findForViewer(currentStoreId(), number, { customerId: customer?.id ?? null, token })
  if (!order) throw new DomainError("not_found", "We couldn't find that order.")
  const next = token ? await service.nextStepFor(order, token, (value) => `${serverSiteUrl()}/orders/${value}`) : { type: "none" as const }
  return Response.json({ order: toOrderDto(order, await service.listReturns(order.id)), next })
})
