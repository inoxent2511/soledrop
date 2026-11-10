import { expect, it, vi } from "vitest"
import { systemActor } from "@/server/db/actor"

it("retains actor scope across separately loaded modules and restores nested identity", async () => {
  const first = await import("@/server/db/context")
  vi.resetModules()
  const second = await import("@/server/db/context")
  expect(first.withActor).not.toBe(second.withActor)
  const actor = systemActor("00000000-0000-4000-8000-000000000001", "integration")
  const nested = systemActor("00000000-0000-4000-8000-000000000002", "integration")
  await first.withActor(actor, async () => {
    await Promise.resolve()
    expect(second.currentActor()).toBe(actor)
    await second.withActor(nested, async () => {
      await Promise.resolve()
      expect(first.currentActor()).toBe(nested)
    })
    expect(second.currentActor()).toBe(actor)
  })
  expect(first.currentActor().kind).toBe("anonymous")
  expect(second.currentActor().kind).toBe("anonymous")
})

it("keeps concurrent actor scopes separate across module graphs, including errors", async () => {
  const first = await import("@/server/db/context")
  vi.resetModules()
  const second = await import("@/server/db/context")
  const actors = Array.from({ length: 20 }, (_, index) => systemActor("00000000-0000-4000-8000-" + String(index).padStart(12, "0"), "integration"))
  await Promise.all(actors.map(actor => first.withActor(actor, async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(second.currentActor()).toBe(actor)
    await expect(second.withActor(actors[(actors.indexOf(actor) + 1) % actors.length], async () => { throw Error("Scope failed") })).rejects.toThrow("Scope failed")
    expect(first.currentActor()).toBe(actor)
  })))
  expect(second.currentActor().kind).toBe("anonymous")
})
