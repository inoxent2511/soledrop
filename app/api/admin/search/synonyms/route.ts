import { z } from "zod"

import { adminRoute } from "@/server/admin/route"
import { parseBody } from "@/server/http/route"
import { staffSearch } from "@/server/reports"

const synonymInput = z.object({ term: z.string().trim().min(1).max(60), synonyms: z.array(z.string().trim().min(1).max(60)).min(1).max(20) })

export const GET = adminRoute("search:read", async ({ staff }) => Response.json({ synonyms: await staffSearch().synonyms(staff) }))

export const POST = adminRoute("search:write", async ({ request, staff, meta }) => Response.json({ synonym: await staffSearch().saveSynonym(staff, meta, await parseBody(request, synonymInput)) }, { status: 201 }))
