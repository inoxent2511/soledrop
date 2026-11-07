import { createConnection } from "mysql2/promise"
import { pathToFileURL } from "node:url"
import { configureConnection, ledgerSql, migrationFiles, supportedEngine } from "./database-common.mjs"

/** DDL auto-commits on both engines; each file is ledgered only after every statement succeeds. */
export async function migrate(connection, options = {}) {
  await configureConnection(connection)
  const [[server]] = await connection.query("SELECT VERSION() AS version, @@version_comment AS comment, DATABASE() AS database_name")
  const engine = supportedEngine(server.version, server.comment)
  const lockName = "soledrop:migrations:" + server.database_name
  const [[lock]] = await connection.execute("SELECT GET_LOCK(?, ?) AS acquired", [lockName, options.lockTimeout ?? 30])
  if (Number(lock.acquired) !== 1) throw new Error("Migration lock unavailable")
  try {
    await connection.query(ledgerSql)
    const [applied] = await connection.query("SELECT name, checksum FROM schema_migrations ORDER BY name")
    const files = await migrationFiles(options.directory)
    for (const row of applied) {
      const current = files.find((file) => file.name === row.name)
      if (!current || current.checksum !== row.checksum) throw new Error("Applied migration checksum changed: " + row.name)
    }
    for (const file of files) {
      if (applied.some((row) => row.name === file.name)) continue
      if (applied.some((row) => row.name > file.name)) throw new Error("Out-of-order migration: " + file.name)
      for (const statement of file.statements) await connection.query(statement)
      await connection.execute("INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)", [file.name, file.checksum])
    }
    return { ...engine, migrations: files.length }
  } finally {
    await connection.execute("SELECT RELEASE_LOCK(?)", [lockName])
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { loadEnvFile } = await import("node:process")
  try { loadEnvFile(".env.local") } catch (error) { if (error.code !== "ENOENT") throw error }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required; use migrator credentials")
  const connection = await createConnection({ uri: process.env.DATABASE_URL, timezone: "Z", dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, multipleStatements: false, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined })
  try { process.stdout.write(JSON.stringify(await migrate(connection)) + "\n") } finally { await connection.end() }
}
