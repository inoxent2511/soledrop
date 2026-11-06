import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { staffCatalog } from "@/server/catalog"
import { parseBody } from "@/server/http/route"

type Context = { params: Promise<{ variantId: string }> }

/** The size's adjustment ledger, newest first. */
export const GET = adminRoute<Context>("inventory:read", async ({ context, staff }) => Response.json({ movements: await staffCatalog().movements(staff, [(await context.params).variantId]) }))

/** Adjusts stock by `delta` with a reason (counted, damaged, received from supplier…). */
export const POST = adminRoute<Context>("inventory:adjust", async ({ request, context, staff, meta }) => {
  const input = await parseBody(request, z.object({ delta: z.number().int().min(-10_000).max(10_000), reason: z.string().trim().min(3, "Give a reason").max(200) }))
  const onHand = await staffCatalog().adjustStock(staff, meta, (await context.params).variantId, input.delta, input.reason)
  return Response.json({ onHand })
})
