import "server-only"

import { assertActor, type Actor } from "@/server/db/actor"
import { DomainError } from "@/server/shared/errors"

/** Optional scale-out reference. Rehydrate returned IDs through the actor-scoped catalogue. */
export function createMeilisearchReference(options: { endpoint: string; index: string; apiKey: string }, request: typeof fetch = fetch) {
  const endpoint = new URL(options.endpoint)
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/" || !/^[a-zA-Z0-9_-]+$/.test(options.index)) throw new Error("Search reference requires an HTTPS origin and index name")
  return {
    async search(actor: Actor, query: string, limit = 24): Promise<string[]> {
      assertActor(actor)
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DomainError("validation", "Invalid search limit.")
      const response = await request(new URL("/indexes/" + options.index + "/search", endpoint), { method: "POST", headers: { authorization: "Bearer " + options.apiKey, "content-type": "application/json" }, body: JSON.stringify({ q: query.slice(0, 100), limit, attributesToRetrieve: ["id", "storeId", "status"], filter: 'storeId = "' + actor.storeId + '" AND status = "active"' }), redirect: "error", signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new DomainError("unavailable", "Search service is unavailable.")
      const result = await response.json() as { hits?: { id?: unknown; storeId?: unknown; status?: unknown }[] }
      return (result.hits ?? []).filter((hit) => hit.storeId === actor.storeId && hit.status === "active" && typeof hit.id === "string" && /^[0-9a-f-]{36}$/.test(hit.id)).map((hit) => String(hit.id))
    },
  }
}
