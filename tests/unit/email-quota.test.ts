import { afterEach, describe, expect, it, vi } from "vitest"
import { serverEnv } from "@/lib/env.server"
import { email } from "@/server/adapters/email"
import { DeliveryDeferred } from "@/server/platform/deferred"
import type { OutboxEvent } from "@/server/platform/types"

const counter = vi.hoisted(() => ({ count: 0, sends: 0 }))
vi.mock("@/server/platform", () => ({ platform: () => ({ hit: async () => ++counter.count }) }))
vi.mock("@/server/adapters/email/smtp", () => ({ createSmtpEmailProvider: () => ({ name: "smtp", send: async () => { counter.sends++; return { id: "local-test" } } }) }))
const previous = { provider: serverEnv.EMAIL_PROVIDER, limit: serverEnv.SMTP_HOURLY_LIMIT }
afterEach(() => { serverEnv.EMAIL_PROVIDER = previous.provider; serverEnv.SMTP_HOURLY_LIMIT = previous.limit })
describe("SMTP hourly cap", () => {
  it("sends up to the configured limit, defers excess until the next UTC window, and ignores non-email topics", async () => {
    serverEnv.EMAIL_PROVIDER = "smtp"; serverEnv.SMTP_HOURLY_LIMIT = 2
    const event: OutboxEvent = { id: "local-event", topic: "customer.registered", payload: { email: "local@example.test" }, status: "pending", attempts: 1, availableAt: new Date().toISOString(), createdAt: new Date().toISOString(), lastError: null }
    await email().sendForEvent(event)
    await email().sendForEvent({ ...event, id: "local-event-2" })
    await expect(email().sendForEvent({ ...event, id: "local-event-3" })).rejects.toBeInstanceOf(DeliveryDeferred)
    expect(counter.sends).toBe(2)
    await email().sendForEvent({ ...event, topic: "payment.recorded" })
    expect(counter.count).toBe(3)
  })
})
