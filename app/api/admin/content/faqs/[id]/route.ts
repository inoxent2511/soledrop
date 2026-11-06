import { faqInput } from "@/features/admin/content/schema"
import { adminRoute } from "@/server/admin/route"
import { staffContent } from "@/server/content"
import { parseBody } from "@/server/http/route"

type Context = { params: Promise<{ id: string }> }

export const PUT = adminRoute<Context>("content:publish", async ({ request, context, staff, meta }) => {
  const faq = await staffContent().saveFaq(staff, meta, await parseBody(request, faqInput), (await context.params).id)
  return Response.json({ faq })
})

export const DELETE = adminRoute<Context>("content:publish", async ({ context, staff, meta }) => {
  await staffContent().deleteFaq(staff, meta, (await context.params).id)
  return new Response(null, { status: 204 })
})
