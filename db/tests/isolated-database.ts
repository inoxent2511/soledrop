import fs from "node:fs/promises"
import { randomBytes } from "node:crypto"
import { createConnection } from "mysql2/promise"
import { migrate } from "../../scripts/migrate.mjs"
import { renderGrants } from "../../scripts/db-grants.mjs"
import { statements } from "../../scripts/database-common.mjs"

/** A fresh local schema for seed/import acceptance, with fresh least-privilege runtime users. */
export async function isolatedDatabase(engine: string) {
  const configured = process.env.DB_TEST_ADMIN_CONNECTIONS ? JSON.parse(process.env.DB_TEST_ADMIN_CONNECTIONS) as Record<string, string> : null
  let adminUrl: URL
  if (configured?.[engine]) adminUrl = new URL(configured[engine])
  else {
    const instances = JSON.parse(await fs.readFile(".data/local-engines/instances.json", "utf8")) as { engine: string; host: string; port: number; rootPassword: string }[]
    const instance = instances.find((row) => row.engine === engine)
    if (!instance) throw new Error("Provide local DB_TEST_ADMIN_CONNECTIONS for isolated seed checks")
    adminUrl = new URL("mysql://127.0.0.1")
    adminUrl.hostname = instance.host; adminUrl.port = String(instance.port); adminUrl.username = "root"; adminUrl.password = instance.rootPassword
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(adminUrl.hostname)) throw new Error("Isolated database tests refuse remote administrators")
  const suffix = randomBytes(6).toString("hex"), name = "soledrop_qa_seed" + suffix, app = "sdqa_" + suffix + "_app", migrator = "sdqa_" + suffix + "_ddl", password = randomBytes(24).toString("hex")
  const root = await createConnection(adminUrl.href)
  const appUrl = new URL(adminUrl), migratorUrl = new URL(adminUrl)
  for (const url of [appUrl, migratorUrl]) { url.pathname = "/" + name; url.password = password }
  appUrl.username = app; migratorUrl.username = migrator
  try {
    await root.query("CREATE DATABASE `" + name + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
    await root.query("CREATE USER ?@'%' IDENTIFIED BY ?", [app, password])
    await root.query("CREATE USER ?@'%' IDENTIFIED BY ?", [migrator, password])
    await root.query("USE `" + name + "`")
    await migrate(root)
    for (const statement of statements(await renderGrants({ database: name, app, migrator, host: "%" }))) await root.query(statement)
  } catch (error) {
    await root.query("DROP DATABASE IF EXISTS `" + name + "`")
    await root.query("DROP USER IF EXISTS ?@'%'", [app]); await root.query("DROP USER IF EXISTS ?@'%'", [migrator]); await root.end()
    throw error
  }
  return {
    appUrl: appUrl.href, migratorUrl: migratorUrl.href,
    async remove() {
      if (!/^soledrop_qa_seed[a-f0-9]{12}$/.test(name)) throw new Error("Invalid task-owned schema")
      try { await root.query("DROP DATABASE `" + name + "`"); await root.query("DROP USER ?@'%'", [app]); await root.query("DROP USER ?@'%'", [migrator]) }
      finally { await root.end() }
    },
  }
}
