import fs from "node:fs/promises"
import { createConnection } from "mysql2/promise"
import { configureConnection, statements } from "./database-common.mjs"

try { process.loadEnvFile(".env.local") } catch (error) { if (error.code !== "ENOENT") throw error }
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required")
const connection = await createConnection(process.env.DATABASE_URL)
try {
  await configureConnection(connection)
  await connection.beginTransaction()
  for (const sql of statements(await fs.readFile("db/seed/bootstrap.sql", "utf8"))) await connection.query(sql)
  await connection.commit()
  process.stdout.write("Operating configuration seeded; catalogue unchanged.\n")
} catch (error) { await connection.rollback(); throw error } finally { await connection.end() }
