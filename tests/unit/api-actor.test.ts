import { afterEach, describe, expect, it } from "vitest"
import { serverEnv } from "@/lib/env.server"
import { apiV1 } from "@/server/http/api-v1"
import { currentActor } from "@/server/db/context"

const previous = serverEnv.API_KEYS
afterEach(() => { serverEnv.API_KEYS = previous })

describe("headless API actor admission", () => {
  const run = apiV1("read", async () => Response.json(currentActor()))
  const write = apiV1("write", async () => Response.json(currentActor()))
  const request = (key: string, extra: Record<string, string> = {}) => new Request("http://127.0.0.1:3200/api/v1/orders/test", { method: "POST", headers: { authorization: "Bearer " + key, ...extra } })
  it("admits only verified keys and never turns a read scope into a write or staff capability", async () => {
    serverEnv.API_KEYS = "reader:local-read-key:read,writer:local-write-key:read+write"
    expect((await run(request("wrong"), {})).status).toBe(401)
    expect((await write(request("local-read-key"), {})).status).toBe(403)
    const response = await run(request("local-read-key"), {})
    expect(response.status).toBe(200)
    const actor = await response.json()
    expect(actor).toMatchObject({ kind: "system", purpose: "integration" })
    expect(actor.permissions).toContain("orders:read")
    expect(actor.permissions).not.toContain("orders:refund")
    expect(actor.permissions).not.toContain("staff:manage")
    expect(actor.permissions).not.toContain("roles:manage")
    expect(JSON.stringify(actor)).not.toContain("local-read-key")
    expect(currentActor().kind).toBe("anonymous")
  })
  it("gives distinct keys distinct cache/rate identities even if the display name matches", async () => {
    serverEnv.API_KEYS = "same:local-first-key:read,same:local-second-key:read"
    const first = await (await run(request("local-first-key"), {})).json()
    const second = await (await run(request("local-second-key"), {})).json()
    expect(first.id).not.toBe(second.id)
  })
  it("checks cookie-authenticated and cross-origin mutations while accepting bearer-only integrations", async () => {
    serverEnv.API_KEYS = "writer:local-write-key:read+write"
    expect((await write(request("local-write-key"), {})).status).toBe(200)
    expect((await write(request("local-write-key", { cookie: "sd_checkout=private" }), {})).status).toBe(403)
    expect((await write(request("local-write-key", { origin: "https://foreign.example" }), {})).status).toBe(403)
    const response = await write(request("local-write-key", { origin: "http://127.0.0.1:3200" }), {})
    expect(response.status).toBe(200)
    const actor = await response.json()
    expect(actor.permissions).toContain("orders:refund")
    expect(actor.permissions).not.toContain("staff:manage")
  })
})
