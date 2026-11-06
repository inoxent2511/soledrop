import { homeSaveInput } from "@/features/admin/content/home-schema"
import { adminRoute } from "@/server/admin/route"
import { staffContent } from "@/server/content"
import { parseBody } from "@/server/http/route"

export const GET = adminRoute("content:read", async ({ staff }) => Response.json({ home: await staffContent().home(staff) }))
export const PUT = adminRoute("content:publish", async ({ request, staff, meta }) => {
  const input = await parseBody(request, homeSaveInput)
  return Response.json(await staffContent().saveHome(staff, meta, input.content, input.expectedUpdatedAt))
})
