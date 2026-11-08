import { describe, expect, it, vi } from "vitest"
import { createMeilisearchReference } from "@/server/adapters/search/meilisearch"
import { anonymousActor } from "@/server/db/actor"

describe("optional Meilisearch reference", () => {
  it("adds mandatory tenant/public filters and drops mismatched response hits", async () => {
    const storeId = "00000000-0000-4000-8000-000000000001", id = "00000000-0000-4000-8000-000000000002"
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ hits: [{ id, storeId, status: "active" }, { id, storeId: "other", status: "active" }, { id, storeId, status: "draft" }] }))
    const adapter = createMeilisearchReference({ endpoint: "https://search.example.test", index: "catalogue", apiKey: "private-local-reference" }, request)
    expect(await adapter.search(anonymousActor(storeId), "nike")).toEqual([id])
    const [url, options] = request.mock.calls[0]
    expect(String(url)).not.toContain("private-local-reference")
    expect(JSON.parse(String(options?.body))).toMatchObject({ filter: 'storeId = "' + storeId + '" AND status = "active"', attributesToRetrieve: ["id", "storeId", "status"] })
    expect(options?.redirect).toBe("error")
  })
})
