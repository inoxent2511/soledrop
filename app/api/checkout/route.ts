import { checkoutSchema } from "@/features/checkout/schemas/checkout"
import { serverSiteUrl } from "@/lib/site-server"
import { customerService } from "@/server/customers"
import { loadCart } from "@/server/http/cart"
import { clearCartCookie, clientKey, currentCustomer, parseBody, rememberCheckoutCart, route } from "@/server/http/route"
import { orderService } from "@/server/orders"
import { enforceRateLimit } from "@/server/platform/guards"
import { DomainError } from "@/server/shared/errors"

/**
 * Place order. Requires an Idempotency-Key header (the checkout form generates one per
 * attempt); a retried request returns the same order instead of creating a second one.
 */
export const POST = route(async (request) => {
  await enforceRateLimit("checkout", await clientKey())
  const idempotencyKey = request.headers.get("idempotency-key")
  if (!idempotencyKey || !/^[A-Za-z0-9_-]{16,80}$/.test(idempotencyKey)) throw new DomainError("validation", "Missing or malformed Idempotency-Key header.")
  const input = await parseBody(request, checkoutSchema)
  const customer = await currentCustomer()
  const { row, shopper } = await loadCart({ create: false })

  const result = await orderService().checkout({
    cart: row,
    shopper,
    email: customer?.email ?? input.email,
    phone: input.address.phone,
    address: input.address,
    shippingCode: input.shippingCode,
    paymentMethod: input.paymentMethod,
    idempotencyKey: `${shopper.storeId}:${idempotencyKey}`,
    customFields: input.customFields,
    note: input.note,
    orderUrl: (number) => `${serverSiteUrl()}/orders/${number}`,
  })

  if (!result.replayed) {
    await rememberCheckoutCart()
    await clearCartCookie()
    if (customer && input.saveAddress) await customerService().saveAddress(customer.id, { ...input.address, isDefault: false })
  }
  return Response.json(
    {
      order: { number: result.order.number, status: result.order.status, total: result.order.total, currency: result.order.currency },
      accessToken: result.accessToken,
      next: result.next,
      replayed: result.replayed,
    },
    { status: result.replayed ? 200 : 201 },
  )
})
