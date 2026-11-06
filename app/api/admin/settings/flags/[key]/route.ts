import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { staffPlatform } from "@/server/reports"

type Context = { params: Promise<{ key: string }> }

/** Switches a feature flag (an environment override, if set, still wins). */
export const PATCH = adminRoute<Context>("settings:flags", async ({ request, context, staff, meta }) => {
  const input = await parseBody(request, z.object({ enabled: z.boolean(), customerGroups: z.array(z.string().min(1).max(30)).max(5).nullable().optional() }))
  return Response.json({ flag: await staffPlatform().setFlag(staff, meta, (await context.params).key, input) })
})
