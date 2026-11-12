import { contactSchema } from "@/features/content/schemas/forms"
import { contentService } from "@/server/content"
import { currentStoreId, unitOfWork } from "@/server/db/driver"
import { clientKey, parseBody, route } from "@/server/http/route"
import { enforceRateLimit } from "@/server/platform/guards"

export const POST = route(async (request) => {
  await enforceRateLimit("contact", await clientKey())
  const { website, ...input } = await parseBody(request, contactSchema)
  // Honeypot filled: answer like a success so bots learn nothing, store nothing.
  if (website) return Response.json({ ok: true }, { status: 202 })
  await unitOfWork(() => contentService().contact(currentStoreId(), input))
  return Response.json({ ok: true }, { status: 202 })
})
