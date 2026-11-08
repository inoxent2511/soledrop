import { runtimeReadiness } from "@/server/runtime/readiness"

/** Readiness verifies this release's schema, tenant, writable storage and configured mail. */
export async function GET() {
  const body = await runtimeReadiness()
  return Response.json(body, { status: body.status === "ready" ? 200 : 503, headers: { "cache-control": "no-store" } })
}
