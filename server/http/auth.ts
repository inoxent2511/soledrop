import "server-only"

import { cookies } from "next/headers"

import { cartService } from "@/server/cart"
import { CART_COOKIE, currentCustomer, setSessionCookie } from "@/server/http/route"
import { currentStoreId } from "@/server/db/driver"

/** After sign-in: set the session cookie and fold the guest bag into the customer's bag. */
export async function completeSignIn(customerId: string, session: { token: string; expiresAt: string }) {
  await setSessionCookie(session.token, session.expiresAt)
  await currentCustomer()
  const service = cartService()
  const storeId = currentStoreId()
  const guest = await service.find(storeId, (await cookies()).get(CART_COOKIE)?.value, null)
  await service.attachToCustomer(guest && guest.customerId === null ? guest : null, customerId, storeId)
}
