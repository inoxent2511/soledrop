import { describe, expect, it } from "vitest"
import { orderSearchValues, substringGram } from "@/server/orders/search-values"

describe("order substring keys", () => {
  it("deduplicates literal values while separating normalized phone digits", () => {
    const values = orderSearchValues({ number: "1234", email: "1234", phone: "12 34", fullName: "Élodie" })
    expect(values.filter((row) => row.kind === 0 && row.normalizedText === "1234")).toHaveLength(1)
    expect(values.find((row) => row.kind === 1)?.valueHash).not.toBe(values.find((row) => row.kind === 0 && row.normalizedText === "1234")?.valueHash)
    expect(values.some((row) => row.normalizedText === "élodie")).toBe(true)
  })
  it("uses a necessary Unicode-safe gram for every literal substring", () => {
    for (const text of ["buyer4999@example.test", "İpek", "𐐨_é\0Z", "a", "12"]) {
      const indexed = orderSearchValues({ number: text, email: "", phone: "", fullName: "" })[0]
      const grams = new Set(indexed.grams.map((gram) => gram.toString("hex"))), points = [...text.toLowerCase()]
      for (let start = 0; start < points.length; start++) for (let end = start + 1; end <= points.length; end++) expect(grams.has(substringGram(points.slice(start, end).join("")).toString("hex"))).toBe(true)
      expect(indexed.grams.every((gram) => gram.length <= 12)).toBe(true)
    }
    expect(substringGram("buyer4999@example.test").toString()).toBe("999")
  })
})
