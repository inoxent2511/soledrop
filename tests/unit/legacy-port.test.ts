import fs from "node:fs"
import { expect, it } from "vitest"
import intents from "@/tests/fixtures/legacy-test-intents.json"

it("retains replacement evidence for all sixty original database test meanings", () => {
  expect(intents).toHaveLength(60)
  expect(new Set(intents.map((entry) => entry.id)).size).toBe(60)
  expect(new Set(intents.map((entry) => entry.sourceFile)).size).toBe(6)
  for (const entry of intents) {
    expect(entry.title.length).toBeGreaterThan(10)
    expect(entry.sourceHash).toMatch(/^[a-f0-9]{64}$/)
    expect(entry.replacements.length).toBeGreaterThan(0)
    for (const file of entry.replacements) {
      expect(fs.existsSync(file), entry.id + ": " + file).toBe(true)
      expect(fs.readFileSync(file, "utf8"), file).toMatch(/\b(?:it|test)(?:\.each)?\(/)
    }
  }
})
