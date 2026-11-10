import { expect, it, vi } from "vitest"

it("defers invalidation until the outer commit across separately loaded server modules", async () => {
  const first = await import("@/server/shared/commit-effects")
  vi.resetModules()
  const second = await import("@/server/shared/commit-effects")
  expect(first.withCommitEffects).not.toBe(second.withCommitEffects)
  const effect = vi.fn()
  await first.withCommitEffects(async () => {
    await second.withCommitEffects(async () => second.afterCommit(effect))
    first.afterCommit(effect)
    expect(effect).not.toHaveBeenCalled()
  })
  expect(effect).toHaveBeenCalledTimes(1)
})

it("discards cross-module effects on rollback without discarding another request's commit", async () => {
  const first = await import("@/server/shared/commit-effects")
  vi.resetModules()
  const second = await import("@/server/shared/commit-effects")
  const rolledBack = vi.fn(), committed = vi.fn()
  const outcomes = await Promise.allSettled([
    first.withCommitEffects(async () => {
      second.afterCommit(rolledBack)
      await Promise.resolve()
      throw Error("Roll back")
    }),
    second.withCommitEffects(async () => {
      first.afterCommit(committed)
      await Promise.resolve()
    }),
  ])
  expect(outcomes.map(outcome => outcome.status)).toEqual(["rejected", "fulfilled"])
  expect(rolledBack).not.toHaveBeenCalled()
  expect(committed).toHaveBeenCalledTimes(1)
})
