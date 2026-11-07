import { forgotPasswordSchema } from "@/features/account/schemas/auth"
import { customerService } from "@/server/customers"
import { currentStoreId } from "@/server/db/driver"
import { clientKey, parseBody, route } from "@/server/http/route"
import { enforceRateLimit } from "@/server/platform/guards"

export const POST = route(async (request) => {
  const input = await parseBody(request, forgotPasswordSchema)
  await enforceRateLimit("auth", await clientKey())
  await enforceRateLimit("auth", "verify:" + input.email)
  await customerService().requestVerification(currentStoreId(), input.email)
  return Response.json({ ok: true })
})
