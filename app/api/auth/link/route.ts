import { cookies } from "next/headers"
import { serverSiteUrl } from "@/lib/site-server"
import { customerService } from "@/server/customers"
import { MAGIC_BROWSER_COOKIE, clearAuthBrowserCookie } from "@/server/http/auth-browser"
import { completeSignIn } from "@/server/http/auth"
import { clientKey, route } from "@/server/http/route"
import { enforceRateLimit } from "@/server/platform/guards"
import { DomainError } from "@/server/shared/errors"

/** One-use capability + initiating-browser cookie prevent magic-link login CSRF. */
export const GET = route(async (request) => {
  await enforceRateLimit("auth", await clientKey())
  const query = new URL(request.url).searchParams, token = query.get("token"), kind = query.get("kind")
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token) || kind !== "magic_link" && kind !== "verify_email") throw new DomainError("validation", "This link is invalid. Ask for a new one.")
  const result = await customerService().redeemLink(token, kind, (await cookies()).get(MAGIC_BROWSER_COOKIE)?.value)
  if (result.session) {
    await completeSignIn(result.customer.id, result.session)
    await clearAuthBrowserCookie(MAGIC_BROWSER_COOKIE)
  }
  const response = Response.redirect(new URL(result.session ? "/account" : "/account/login", serverSiteUrl()), 303)
  response.headers.set("referrer-policy", "no-referrer")
  return response
})
