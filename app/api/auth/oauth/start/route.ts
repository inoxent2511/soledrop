import { z } from "zod"
import { verifyPassword } from "@/server/customers/password"
import { customerOidc } from "@/server/customers/oidc"
import { OIDC_BROWSER_COOKIE, setAuthBrowserCookie } from "@/server/http/auth-browser"
import { clientKey, currentCustomer, parseBody, route } from "@/server/http/route"
import { enforceRateLimit } from "@/server/platform/guards"
import { DomainError } from "@/server/shared/errors"

export const POST = route(async (request) => {
  await enforceRateLimit("auth", await clientKey())
  const input = await parseBody(request, z.object({ currentPassword: z.string().max(200).optional() })), customer = await currentCustomer()
  if (customer && (!input.currentPassword || !await verifyPassword(input.currentPassword, customer.passwordHash))) throw new DomainError("unauthorized", "Confirm your current password before connecting this identity.")
  const started = await customerOidc().start(customer?.id ?? null)
  await setAuthBrowserCookie(OIDC_BROWSER_COOKIE, started.browserNonce)
  return Response.json({ url: started.url })
})
