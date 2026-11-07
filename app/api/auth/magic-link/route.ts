import { forgotPasswordSchema } from "@/features/account/schemas/auth"
import { newToken } from "@/server/admin/crypto"
import { customerService } from "@/server/customers"
import { currentStoreId } from "@/server/db/driver"
import { MAGIC_BROWSER_COOKIE, setAuthBrowserCookie } from "@/server/http/auth-browser"
import { clientKey, parseBody, route } from "@/server/http/route"
import { enforceRateLimit } from "@/server/platform/guards"

export const POST = route(async (request) => {
  const input = await parseBody(request, forgotPasswordSchema), browserNonce = newToken()
  await enforceRateLimit("auth", await clientKey())
  await enforceRateLimit("auth", "magic:" + input.email)
  await customerService().requestMagicLink(currentStoreId(), input.email, browserNonce)
  await setAuthBrowserCookie(MAGIC_BROWSER_COOKIE, browserNonce)
  return Response.json({ ok: true })
})
