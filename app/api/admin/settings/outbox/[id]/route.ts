import { adminRoute } from "@/server/admin/route"
import { staffPlatform } from "@/server/reports"

type Context = { params: Promise<{ id: string }> }

/** Puts a failed email or webhook back in the queue. */
export const POST = adminRoute<Context>("jobs:run", async ({ context, staff, meta }) => {
  await staffPlatform().retryEvent(staff, meta, (await context.params).id)
  return new Response(null, { status: 204 })
})
