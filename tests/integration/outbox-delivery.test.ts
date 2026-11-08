import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { serverEnv } from "@/lib/env.server"
import { systemActor } from "@/server/db/actor"
import { withActor } from "@/server/db/context"
import { STORE_ID } from "@/server/fixtures/seed"
import { db, resetFixtures } from "@/server/fixtures/store"
import { platform } from "@/server/platform"
import { drainOutbox } from "@/server/platform/events"
import { DeliveryDeferred } from "@/server/platform/deferred"

const send = vi.hoisted(() => vi.fn(async () => {}))
vi.mock("@/server/adapters/email", () => ({ email: () => ({ sendForEvent: send }) }))
const originalEndpoints = serverEnv.WEBHOOK_ENDPOINTS
beforeEach(() => { resetFixtures(); send.mockReset(); send.mockResolvedValue(undefined) })
afterEach(() => { serverEnv.WEBHOOK_ENDPOINTS = originalEndpoints; vi.unstubAllGlobals(); vi.restoreAllMocks() })
const worker = systemActor(STORE_ID, "jobs", ["jobs:run"])

describe("independent durable outbox channels", () => {
  it("does not send email again when a webhook fails and the event is retried", async () => withActor(worker, async () => {
    serverEnv.WEBHOOK_ENDPOINTS = "https://local.invalid/hook|local-webhook-secret|*"
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("temporary", { status: 503 })).mockResolvedValueOnce(new Response("accepted"))
    vi.stubGlobal("fetch", fetcher)
    const event = await platform().enqueue(STORE_ID, "contact.received", { email: "local@example.test", token: "private-bearer" })
    expect(await drainOutbox()).toMatchObject({ delivered: 0, failed: 1 })
    expect(send).toHaveBeenCalledTimes(1)
    db().outbox.find((row) => row.id === event.id)!.availableAt = "2000-01-01T00:00:00Z"
    expect(await drainOutbox()).toMatchObject({ delivered: 1, failed: 0 })
    expect(send).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0][1].body).not.toContain("private-bearer")
    expect(fetcher.mock.calls[0][1].body).not.toContain('"token"')
  }))
  it("defers quota-bound delivery without consuming a failure attempt", async () => withActor(worker, async () => {
    serverEnv.WEBHOOK_ENDPOINTS = ""
    const retryAt = new Date(Date.now() + 3_600_000).toISOString()
    send.mockRejectedValueOnce(new DeliveryDeferred(retryAt))
    const event = await platform().enqueue(STORE_ID, "contact.received", {})
    expect(await drainOutbox()).toMatchObject({ deferred: 1, failed: 0, delivered: 0 })
    expect(db().outbox.find((row) => row.id === event.id)).toMatchObject({ attempts: 0, status: "pending", availableAt: retryAt })
    expect((await drainOutbox()).claimed).toBe(0)
    db().outbox.find((row) => row.id === event.id)!.availableAt = "2000-01-01T00:00:00Z"
    expect((await drainOutbox()).delivered).toBe(1)
  }))
  it("defers unstarted events when the cooperative request budget is exhausted", async () => withActor(worker, async () => {
    serverEnv.WEBHOOK_ENDPOINTS = ""
    let elapsed = 0
    vi.spyOn(performance, "now").mockImplementation(() => elapsed)
    send.mockImplementationOnce(async () => { elapsed = 25_000 })
    await platform().enqueue(STORE_ID, "contact.received", {})
    const waiting = await platform().enqueue(STORE_ID, "contact.received", {})
    expect(await drainOutbox()).toMatchObject({ claimed: 2, delivered: 1, deferred: 1, failed: 0 })
    expect(send).toHaveBeenCalledTimes(1)
    expect(db().outbox.find((row) => row.id === waiting.id)).toMatchObject({ status: "pending", attempts: 0 })
  }))
})
