import { describe, expect, it } from "vitest"
import { afterCommit, withCommitEffects } from "@/server/shared/commit-effects"

describe("committed invalidation", () => {
  it("runs once after the outer commit and discards effects on rollback", async () => {
    const events: string[] = [], invalidate = () => { events.push("invalidate") }
    await withCommitEffects(async () => {
      afterCommit(invalidate)
      await withCommitEffects(async () => { afterCommit(invalidate); events.push("write") })
      expect(events).toEqual(["write"])
      events.push("commit")
    })
    expect(events).toEqual(["write", "commit", "invalidate"])
    await expect(withCommitEffects(async () => { afterCommit(invalidate); throw new Error("rollback") })).rejects.toThrow("rollback")
    expect(events).toEqual(["write", "commit", "invalidate"])
  })
  it("isolates overlapping request effects", async () => {
    const events: string[] = []
    let resume!: () => void
    const gate = new Promise<void>((resolve) => { resume = resolve })
    const first = withCommitEffects(async () => { afterCommit(() => { events.push("first") }); await gate })
    await withCommitEffects(async () => { afterCommit(() => { events.push("second") }) })
    expect(events).toEqual(["second"])
    resume(); await first
    expect(events).toEqual(["second", "first"])
  })
})
