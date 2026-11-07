import { createConnection } from "mysql2/promise"
import { spawnSync } from "node:child_process"
import { migrate } from "./migrate.mjs"

try { process.loadEnvFile(".env.local") } catch (error) { if (error.code !== "ENOENT") throw error }
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required")
const url = new URL(process.env.DATABASE_URL)
const name = url.pathname.slice(1)
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !/^soledrop_(?:test|qa)(?:_[a-z0-9]+)?$/.test(name) || process.env.DB_RESET_CONFIRM !== name) throw new Error("Reset requires a local soledrop_test/qa database and DB_RESET_CONFIRM equal to its name")
const connection = await createConnection(process.env.DATABASE_URL)
try {
  const [rows] = await connection.query("SHOW TABLES")
  await connection.query("SET FOREIGN_KEY_CHECKS = 0")
  for (const row of rows) {
    const table = String(Object.values(row)[0])
    if (!/^[a-z_]+$/.test(table)) throw new Error("Unsafe table name")
    await connection.query("DROP TABLE `" + table + "`")
  }
  await connection.query("SET FOREIGN_KEY_CHECKS = 1")
  await migrate(connection)
} finally { await connection.end() }
const result = spawnSync(process.execPath, ["scripts/db-seed.mjs"], { stdio: "inherit", windowsHide: true })
process.exitCode = result.status ?? 1
