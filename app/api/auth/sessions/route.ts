import { cookies } from "next/headers"
import { z } from "zod"
import { customerService } from "@/server/customers"
import { SESSION_COOKIE, parseBody, requireCustomer, route } from "@/server/http/route"

export const GET = route(async () => {
  const customer = await requireCustomer()
  return Response.json({ sessions: await customerService().listSessions(customer, (await cookies()).get(SESSION_COOKIE)?.value ?? "") })
})

export const DELETE = route(async (request) => {
  const customer = await requireCustomer(), input = await parseBody(request, z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) }))
  await customerService().revokeSession(customer, input.id)
  return Response.json({ ok: true })
})
