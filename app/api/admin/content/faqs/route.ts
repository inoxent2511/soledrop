import { faqInput } from "@/features/admin/content/schema"
import { adminRoute } from "@/server/admin/route"
import { staffContent } from "@/server/content"
import { parseBody } from "@/server/http/route"

export const GET = adminRoute("content:read", async ({ staff }) => Response.json({ faqs: await staffContent().faqs(staff) }))

export const POST = adminRoute("content:publish", async ({ request, staff, meta }) => {
  const faq = await staffContent().saveFaq(staff, meta, await parseBody(request, faqInput))
  return Response.json({ faq }, { status: 201 })
})
