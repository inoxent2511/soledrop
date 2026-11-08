import fs from "node:fs/promises"
import { createHash } from "node:crypto"
import { demoFixture, readDemoFixture } from "@/server/fixtures/demo"
import { ALL_PERMISSIONS } from "@/server/admin/permissions"
import { systemActor } from "@/server/db/actor"
import { closeDatabase } from "@/server/db/client"
import { importSnapshot } from "@/server/db/import.repository"

if (process.argv.includes("--write-fixture")) {
  await fs.writeFile("db/seed/demo.json", demoFixture())
  console.log("Generated isolated public QA fixture; merchant data was not read.")
} else {
  const url = new URL(process.env.DATABASE_URL ?? "")
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !/^\/soledrop_(test|qa)(_[a-z0-9]+)?$/.test(url.pathname)) throw new Error("Demo seed only targets an explicitly isolated local test/QA database")
  const source = await fs.readFile("db/seed/demo.json", "utf8"), tables = readDemoFixture(source)
  try {
    const counts = await importSnapshot(systemActor(tables.stores[0].id, "migration", ALL_PERMISSIONS), tables, createHash("sha256").update(source).digest("hex"))
    console.log(JSON.stringify({ kind: "isolated-qa-demo", products: counts.products, note: "Demo is explicit; empty-database guard enforced. db:reset removes it from this isolated database." }))
  } finally { await closeDatabase() }
}
