import fs from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { migrationFiles } from "./database-common.mjs"

export const appendOnlyTables = ["audit_log", "inventory_movements", "order_notes", "webhook_deliveries", "data_imports"]

/** Provision fresh dedicated users in hPanel first. Run this SQL as the schema administrator. */
export async function renderGrants({ database = "soledrop", app = "soledrop_app", migrator = "soledrop_migrator", host = "localhost" } = {}) {
  for (const value of [database, app, migrator, host]) if (!/^[a-zA-Z0-9_.%-]+$/.test(value)) throw new Error("Unsafe grant identifier")
  if (app === migrator) throw new Error("Runtime and migration accounts must differ")
  const tables = new Set(["schema_migrations"])
  for (const file of await migrationFiles()) for (const match of file.source.matchAll(/CREATE TABLE IF NOT EXISTS\s+`?([a-z_]+)`?/g)) tables.add(match[1])
  const lines = ["-- Fresh dedicated users only. Never give the runtime account global or schema-wide grants.", "-- Accounts/passwords are created privately in hPanel; no credentials belong in this file.", "-- If hPanel allows only one DDL-capable user, audit immutability cannot be guaranteed by grants.", `GRANT ALL PRIVILEGES ON \`${database}\`.* TO '${migrator}'@'${host}';`]
  for (const table of [...tables].sort()) {
    const grants = table === "schema_migrations" ? "SELECT" : appendOnlyTables.includes(table) ? "SELECT, INSERT" : "SELECT, INSERT, UPDATE, DELETE"
    lines.push(`GRANT ${grants} ON \`${database}\`.\`${table}\` TO '${app}'@'${host}';`)
  }
  return lines.join("\n") + "\n"
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sql = await renderGrants({ database: process.env.GRANT_DATABASE, app: process.env.GRANT_APP_USER, migrator: process.env.GRANT_MIGRATOR_USER, host: process.env.GRANT_ACCOUNT_HOST })
  await fs.writeFile("db/dist/grants.sql", sql)
  process.stdout.write("Prepared db/dist/grants.sql. Set GRANT_* variables for actual dedicated account names.\n")
}
