import { describe, expect, it, vi } from "vitest"
import { createPrivateFiles, privateFileKey } from "@/server/adapters/storage/private-files"
import { anonymousActor, type Actor } from "@/server/db/actor"
import { DomainError } from "@/server/shared/errors"

const storeId = "00000000-0000-4000-8000-000000000001", id = "00000000-0000-4000-8000-000000000002", otherId = "00000000-0000-4000-8000-000000000003"
const secret = "private-test-signing-secret-with-at-least-32-characters", at = Date.now()
const actor: Actor = { ...anonymousActor(storeId), kind: "customer", id, email: "local@example.test" }
describe("private storage capabilities", () => {
  it("authorizes the resource before writing/signing and binds short links to their exact store/path", async () => {
    const storage = { put: vi.fn(async () => ({ etag: "test" })), get: vi.fn(async () => null), remove: vi.fn(), writable: vi.fn(async () => true) }
    const authorize = vi.fn(async (a: Actor, resource: { id: string }) => { if (a.kind !== "customer" || a.id !== resource.id) throw new DomainError("forbidden", "Not yours") })
    const files = createPrivateFiles({ storeId, secret, storage, authorize, clock: () => at })
    const resource = { kind: "customer" as const, id }, key = await files.put(actor, resource, new Uint8Array([1, 2]))
    const url = await files.signedUrl(actor, resource, key, 60), token = new URL(url, "https://local.test").searchParams.get("token")!
    expect(privateFileKey(token, storeId, secret, at)).toBe(key)
    expect(() => privateFileKey(token, storeId, secret, at + 60_001)).toThrow("expired")
    expect(() => privateFileKey(token, otherId, secret, at)).toThrow("invalid")
    expect(() => privateFileKey(token.slice(0, -1) + "!", storeId, secret, at)).toThrow("invalid")
    await expect(files.put(actor, { kind: "customer", id: otherId }, new Uint8Array([3]))).rejects.toMatchObject({ code: "forbidden" })
    await expect(files.signedUrl(actor, resource, key.replace(id, otherId))).rejects.toMatchObject({ code: "forbidden" })
    await expect(files.signedUrl(actor, resource, key, 301)).rejects.toMatchObject({ code: "forbidden" })
    expect(storage.put).toHaveBeenCalledTimes(1)
  })
})
