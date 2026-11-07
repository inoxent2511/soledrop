import { cookies } from "next/headers"
import { publicEnv } from "@/lib/env"
import { customerOidc } from "@/server/customers/oidc"
import { OIDC_BROWSER_COOKIE, clearAuthBrowserCookie } from "@/server/http/auth-browser"
import { completeSignIn } from "@/server/http/auth"
import { clientKey, currentCustomer, route } from "@/server/http/route"
import { enforceRateLimit } from "@/server/platform/guards"

export const GET = route(async (request) => {
  await enforceRateLimit("auth", await clientKey())
  const customer = await currentCustomer()
  const callback = new URL("/api/auth/oauth/callback", publicEnv.NEXT_PUBLIC_SITE_URL)
  callback.search = new URL(request.url).search
  const result = await customerOidc().complete(callback, (await cookies()).get(OIDC_BROWSER_COOKIE)?.value, customer?.id ?? null)
  await completeSignIn(result.customer.id, result.session)
  await clearAuthBrowserCookie(OIDC_BROWSER_COOKIE)
  const response = Response.redirect(new URL("/account", publicEnv.NEXT_PUBLIC_SITE_URL), 303)
  response.headers.set("referrer-policy", "no-referrer")
  return response
})
