import { z } from "zod"

import { adminService } from "@/server/admin"
import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"

type Context = { params: Promise<{ key: string }> }

const body = z.object({
  name: z.string().trim().min(2, "Name the role").max(60),
  description: z.string().trim().max(200).default(""),
  refundLimit: z.number().int().min(0).max(100_000_000_00).nullable(),
  permissions: z.array(z.string().max(40)).max(100),
  expectedUpdatedAt: z.string().max(40).optional(),
})

export const PUT = adminRoute<Context>({ permission: "roles:manage", stepUp: true }, async ({ request, context, staff, meta }) => {
  const { expectedUpdatedAt, ...input } = await parseBody(request, body)
  return Response.json({ role: await adminService().saveRole(staff, { ...input, key: (await context.params).key }, meta, expectedUpdatedAt) })
})

export const DELETE = adminRoute<Context>({ permission: "roles:manage", stepUp: true }, async ({ context, staff, meta }) => {
  await adminService().deleteRole(staff, (await context.params).key, meta)
  return new Response(null, { status: 204 })
})
