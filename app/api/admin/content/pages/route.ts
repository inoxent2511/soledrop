import { pageInput } from "@/features/admin/content/schema"
import { adminRoute } from "@/server/admin/route"
import { staffContent } from "@/server/content"
import { parseBody } from "@/server/http/route"

export const GET = adminRoute("content:read", async ({ staff }) => Response.json({ pages: await staffContent().pages(staff) }))

/** Creates a draft page. */
export const POST = adminRoute("content:write", async ({ request, staff, meta }) => {
  const page = await staffContent().savePage(staff, meta, await parseBody(request, pageInput), {})
  return Response.json({ slug: page.slug, updatedAt: page.updatedAt }, { status: 201 })
})
