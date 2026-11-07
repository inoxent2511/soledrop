import { z } from "zod"
import { customerService } from "@/server/customers"
import { parseBody, requireCustomer, route, setSessionCookie } from "@/server/http/route"

export const PATCH = route(async (request) => {
  const customer = await requireCustomer()
  const input = await parseBody(request, z.object({ email: z.email().max(254), currentPassword: z.string().min(1).max(200) }))
  const result = await customerService().changeEmail(customer, input.currentPassword, input.email)
  await setSessionCookie(result.session.token, result.session.expiresAt)
  return Response.json({ customer: result.customer })
})
