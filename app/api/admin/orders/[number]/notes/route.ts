import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { staffOrders } from "@/server/orders"

type Context = { params: Promise<{ number: string }> }

/** Adds a staff-only note to an order. */
export const POST = adminRoute<Context>("orders:write", async ({ request, context, staff, meta }) => {
  const { body } = await parseBody(request, z.object({ body: z.string().trim().min(1, "Write a note").max(2000) }))
  const note = await staffOrders().addNote(staff, meta, (await context.params).number, body)
  return Response.json({ note: { id: note.id, authorName: note.authorName, body: note.body, createdAt: note.createdAt } }, { status: 201 })
})
