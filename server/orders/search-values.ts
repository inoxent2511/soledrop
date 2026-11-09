import { createHash } from "node:crypto"

export function substringGram(text: string): Buffer {
  const points = [...text]
  // Identifying digits are usually more selective than shared mail domains.
  for (let start = points.length - 3; start >= 0; start--) {
    const candidate = points.slice(start, start + 3)
    if (candidate.every((point) => /^[0-9]$/.test(point))) return Buffer.from(candidate.join(""))
  }
  return Buffer.from(points.slice(0, 3).join(""))
}

/** Values are shared only inside a store, separately for literal and digit matching. */
export function orderSearchValues(input: { number: string; email: string; phone: string; fullName: string }) {
  const values = new Map<string, { valueHash: string; kind: number; normalizedText: string; grams: Buffer[] }>()
  const fields = [input.number, input.email, input.phone, input.fullName].map((text) => ({ kind: 0, text: text.toLowerCase() }))
  fields.push({ kind: 1, text: input.phone.replace(/\D/g, "") })
  for (const { kind, text } of fields) {
    if (!text) continue
    const valueHash = createHash("sha256").update(String(kind) + "\0" + text).digest("hex")
    const points = [...text], grams = new Map<string, Buffer>()
    for (let start = 0; start < points.length; start++) for (let size = 1; size <= 3 && start + size <= points.length; size++) {
      const gram = Buffer.from(points.slice(start, start + size).join(""))
      grams.set(gram.toString("hex"), gram)
    }
    values.set(valueHash, { valueHash, kind, normalizedText: text, grams: [...grams.values()] })
  }
  return [...values.values()]
}
