import { describe, expect, it } from "vitest"
import { anonymousActor, systemActor } from "@/server/db/actor"
import { currentActor, establishActor, establishCartToken, establishCustomer, withActor } from "@/server/db/context"
import { hashToken } from "@/server/admin/crypto"

const storeId = "00000000-0000-4000-8000-000000000001"
describe("request actor context", () => {
  it("defaults to anonymous and never infers a system capability", () => {
    expect(currentActor()).toMatchObject({ kind: "anonymous", permissions: [] })
  })

  it("isolates concurrent requests across awaits and restores nested scopes", async () => {
    let release = () => {}
    const barrier = new Promise<void>((resolve) => { release = resolve })
    const first = withActor(anonymousActor(storeId), async () => {
      establishCartToken("first-cart-token")
      await barrier
      expect(currentActor()).toMatchObject({ kind: "anonymous", cartTokenHash: hashToken("first-cart-token") })
      await withActor(systemActor(storeId, "auth:customer"), async () => {
        await Promise.resolve()
        expect(currentActor()).toMatchObject({ kind: "system", purpose: "auth:customer" })
      })
      expect(currentActor()).toMatchObject({ kind: "anonymous", cartTokenHash: hashToken("first-cart-token") })
    })
    const second = withActor(anonymousActor(storeId), async () => {
      establishCartToken("second-cart-token")
      release(); await Promise.resolve()
      expect(currentActor()).toMatchObject({ cartTokenHash: hashToken("second-cart-token") })
    })
    await Promise.all([first, second])
    expect(currentActor()).toMatchObject({ kind: "anonymous" })
    expect(currentActor()).not.toHaveProperty("cartTokenHash")
  })

  it("establishes a customer from server identity/session proof while retaining a guest bag", async () => {
    await withActor(anonymousActor(storeId), async () => {
      establishCartToken("guest-bag")
      await Promise.resolve()
      establishCustomer({ id: "00000000-0000-4000-8000-000000000002", storeId, email: "customer@example.test", fullName: "Customer", passwordHash: "private", phone: null, group: "retail", marketingOptIn: false, createdAt: new Date().toISOString(), deletionRequestedAt: null }, "opaque-session")
      expect(currentActor()).toMatchObject({ kind: "customer", sessionTokenHash: hashToken("opaque-session"), cartTokenHash: hashToken("guest-bag"), permissions: [] })
      expect(JSON.stringify(currentActor())).not.toContain("private")
      expect(JSON.stringify(currentActor())).not.toContain("opaque-session")
      establishActor(anonymousActor(storeId))
      expect(currentActor().kind).toBe("anonymous")
    })
  })
})
