import { describe, expect, it } from "vitest"

import { renderEventEmail } from "@/server/adapters/email/templates"
import type { OutboxEvent } from "@/server/platform/types"

describe("contact form notification", () => {
  it("addresses the support mailbox and links to the private admin inbox", () => {
    const event: OutboxEvent = {
      id: "contact-event", topic: "contact.received", status: "pending", attempts: 0,
      availableAt: "2026-11-13T00:00:00.000Z", createdAt: "2026-11-13T00:00:00.000Z", lastError: null,
      payload: { id: "contact-id", name: "Customer", email: "customer@example.test", orderNumber: "SD10001" },
    }
    const email = renderEventEmail(event)
    expect(email?.to).toBe("support@soledrop.store")
    expect(email?.subject).toBe("New contact message")
    expect(email?.text).toContain("customer@example.test")
    expect(email?.text).toContain("/admin/messages")
    expect(email?.text).toContain("SD10001")
  })
})
