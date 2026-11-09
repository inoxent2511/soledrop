import { expect, it } from "vitest"
import { editDistance } from "@/server/search/match"

/** Independent full-matrix definition of optimal string alignment, without a cap or band. */
function reference(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0))
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]))
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1)
  }
  return rows[a.length][b.length]
}

it("matches full-matrix OSA for every short word pair, including swaps at the band boundary", () => {
  const words = [""]
  let level = [""]
  for (let length = 1; length <= 4; length++) { level = level.flatMap(word => ["a", "b", "c"].map(letter => word + letter)); words.push(...level) }
  for (const a of words) for (const b of words) {
    const expected = reference(a, b)
    for (const max of [0, 1, 2, 3]) if (editDistance(a, b, max) !== Math.min(expected, max + 1)) throw Error(`Distance mismatch: ${a}/${b}, cap ${max}`)
  }
})

it("retains UTF-16, long-word and fractional cap behavior", () => {
  const words = ["", "𠮷", "𠮷a", "a𠮷", "é", "e\u0301", "model50000", "model05000", "unfindable", "x".repeat(150), "x".repeat(148) + "yz"]
  for (const a of words) for (const b of words) for (const max of [0, 1, 1.5, 2, 3, Infinity]) {
    const expected = Math.abs(a.length - b.length) > max ? max + 1 : Math.min(reference(a, b), max + 1)
    expect(editDistance(a, b, max)).toBe(expected)
  }
})
