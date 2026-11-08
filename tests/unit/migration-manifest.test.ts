import fs from "node:fs"
import { createHash } from "node:crypto"
import { expect, it } from "vitest"
import { expectedMigrations } from "@/server/db/migration-manifest"

it("ships exactly the canonical SQL checksums used by runtime readiness", () => {
  const names = fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()
  expect(expectedMigrations.map((row) => row.name)).toEqual(names)
  for (const entry of expectedMigrations) {
    const source = fs.readFileSync("db/migrations/" + entry.name, "utf8").replaceAll("\r\n", "\n")
    expect(createHash("sha256").update(source).digest("hex"), entry.name).toBe(entry.checksum)
  }
})
