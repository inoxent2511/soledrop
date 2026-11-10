import { expect, it } from "vitest"
import { BoundedSelection } from "@/server/shared/bounded-selection"

it("matches full sorting while retaining only the requested number of candidates", () => {
  const values = Array.from({ length: 100000 }, (_, index) => (index * 7919) % 100003)
  for (const direction of [1, -1]) for (const limit of [1, 25, 200]) {
    const compare = (a: number, b: number) => direction * (a - b), selection = new BoundedSelection(limit, compare)
    for (const value of values) {
      selection.add(value)
      if (selection.size > limit) throw Error("Selection exceeded its bound")
    }
    const sorted = values.toSorted(compare)
    expect(selection.sorted()).toEqual(sorted.slice(0, limit))
    expect(selection.largest).toBe(sorted[limit - 1])
  }
})

it("delegates title and tie ordering to the supplied comparator", () => {
  const values = ["ä", "A", "a", "𠮷", "ß", "ss", "e\u0301", "é", "a"].map((title, index) => ({ title, index }))
  const compare = (a: typeof values[number], b: typeof values[number]) => a.title.localeCompare(b.title) || a.index - b.index
  const selection = new BoundedSelection(5, compare)
  values.toReversed().forEach(value => selection.add(value))
  expect(selection.sorted()).toEqual(values.toSorted(compare).slice(0, 5))
  const copy = selection.sorted(); copy.length = 0
  expect(selection.size).toBe(5)
  expect(() => new BoundedSelection(0, compare)).toThrow(RangeError)
})
