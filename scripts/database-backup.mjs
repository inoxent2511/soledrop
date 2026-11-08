import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"
import { createConnection } from "mysql2/promise"
import { configureConnection, migrationFiles, statements, supportedEngine } from "./database-common.mjs"

const identifier = (value) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error("Unsupported backup identifier")
  return "`" + value + "`"
}
const literal = (value) => {
  if (value === null) return "NULL"
  if (Buffer.isBuffer(value)) return "X'" + value.toString("hex") + "'"
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Invalid numeric backup value")
    return String(value)
  }
  if (typeof value !== "string") throw new Error("Backup requires raw date/JSON/bigint strings")
  return "CONVERT(X'" + Buffer.from(value, "utf8").toString("hex") + "' USING utf8mb4)"
}
const insert = (table, columns, batch) => "INSERT INTO " + identifier(table) + " (" + columns + ") VALUES\n" + batch.join(",\n") + (table === "schema_migrations" ? " ON DUPLICATE KEY UPDATE applied_at=VALUES(applied_at)" : "") + ";\n"

async function metadata(connection) {
  const [[server]] = await connection.query("SELECT DATABASE() AS name, VERSION() AS version, @@version_comment AS comment")
  const engine = supportedEngine(server.version, server.comment)
  const [tables] = await connection.query("SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME")
  if (tables.some((table) => table.engine !== "InnoDB")) throw new Error("Consistent backups require InnoDB tables")
  const [ledger] = await connection.query("SELECT name, checksum FROM schema_migrations ORDER BY name")
  const expected = (await migrationFiles()).map(({ name, checksum }) => ({ name, checksum }))
  if (JSON.stringify(ledger) !== JSON.stringify(expected)) throw new Error("Backup/restore requires the exact current migration ledger")
  return { engine, tables, ledger }
}

/** Data only: restore the authoritative forward schema before importing this snapshot. */
export async function backupDatabase(connection, outputFile) {
  await configureConnection(connection)
  const info = await metadata(connection), mediaPaths = []
  /** @type {Record<string, number>} */
  const counts = {}
  const output = await fs.open(outputFile, "wx", 0o600), hash = createHash("sha256")
  const write = async (text) => { hash.update(text); await output.writeFile(text, "utf8") }
  try {
    await connection.query("SET TRANSACTION READ ONLY")
    await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT")
    await write("-- PRIVATE merchant backup. Never commit or place in a public directory.\n-- Import only into an empty schema created from this release's db/dist/full-schema.sql.\nSET NAMES utf8mb4;\nSET time_zone = '+00:00';\nSET FOREIGN_KEY_CHECKS=0;\nSTART TRANSACTION;\n")
    for (const table of info.tables) {
      const [columns] = await connection.execute("SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND (GENERATION_EXPRESSION IS NULL OR GENERATION_EXPRESSION='') ORDER BY ORDINAL_POSITION", [table.name])
      const names = columns.map((column) => column.name), quoted = names.map(identifier).join(",")
      counts[table.name] = 0
      const stream = connection.connection.query("SELECT " + quoted + " FROM " + identifier(table.name)).stream({ highWaterMark: 100 })
      let batch = []
      for await (const row of stream) {
        counts[table.name]++
        if (table.name === "media") mediaPaths.push(row.path)
        batch.push("(" + names.map((name) => literal(row[name])).join(",") + ")")
        if (batch.length === 100) { await write(insert(table.name, quoted, batch)); batch = [] }
      }
      if (batch.length) await write(insert(table.name, quoted, batch))
    }
    await write("COMMIT;\nSET FOREIGN_KEY_CHECKS=1;\n")
    await connection.commit()
    return { engine: info.engine, sha256: hash.digest("hex"), counts, mediaPaths }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { await output.close() }
}

/** Refuses existing merchant data; rollback on a failed insert, always restores FK checks. */
export async function restoreDatabase(connection, inputFile, expectedDigest) {
  await configureConnection(connection)
  const info = await metadata(connection)
  for (const table of info.tables) {
    if (table.name === "schema_migrations") continue
    const [[row]] = await connection.query("SELECT COUNT(*) AS total FROM " + identifier(table.name))
    if (Number(row.total) !== 0) throw new Error("Restore refuses nonempty table: " + table.name)
  }
  const source = await fs.readFile(inputFile, "utf8")
  if (!/^[a-f0-9]{64}$/.test(expectedDigest ?? "") || createHash("sha256").update(source).digest("hex") !== expectedDigest) throw new Error("Backup checksum mismatch")
  if (!source.startsWith("-- PRIVATE merchant backup.")) throw new Error("Not an application backup")
  const commands = statements(source)
  const allowed = new Set(["SET NAMES utf8mb4", "SET time_zone = '+00:00'", "SET FOREIGN_KEY_CHECKS=0", "START TRANSACTION", "COMMIT", "SET FOREIGN_KEY_CHECKS=1"])
  const tables = new Set(info.tables.map((table) => table.name))
  // Backup literals are hex, NULL or finite decimals: no embedded SQL text or arbitrary commands.
  for (const command of commands) {
    if (allowed.has(command)) continue
    const ledgerSuffix = " ON DUPLICATE KEY UPDATE applied_at=VALUES(applied_at)"
    const ledger = command.startsWith("INSERT INTO `schema_migrations` ")
    if (ledger && !command.endsWith(ledgerSuffix)) throw new Error("Invalid ledger restoration")
    const match = /^INSERT INTO `([a-zA-Z_][a-zA-Z0-9_]*)` \((`[a-zA-Z_][a-zA-Z0-9_]*`)(,`[a-zA-Z_][a-zA-Z0-9_]*`)*\) VALUES\n([\s\S]+)$/.exec(ledger ? command.slice(0, -ledgerSuffix.length) : command)
    if (!match || !tables.has(match[1]) || !/^(?:\s|\(|\)|,|NULL|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|X'[a-f0-9]*'|CONVERT\(X'[a-f0-9]*' USING utf8mb4\))+$/.test(match[4])) throw new Error("Unsupported backup statement")
  }
  try {
    for (const command of commands) await connection.query(command)
  } catch (error) { await connection.rollback(); throw error }
  finally { await connection.query("SET FOREIGN_KEY_CHECKS=1") }
  return { engine: info.engine }
}

export async function backupConnection(url) {
  return createConnection({ uri: url, dateStrings: true, jsonStrings: true, supportBigNumbers: true, bigNumberStrings: true, timezone: "Z", multipleStatements: false, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.DATABASE_URL === undefined) { try { process.loadEnvFile(".env.local") } catch (error) { if (error.code !== "ENOENT") throw error } }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for backup/restore")
  const [action, file] = process.argv.slice(2)
  if (!["backup", "restore"].includes(action) || !file || !path.isAbsolute(file)) throw new Error("Use database-backup.mjs backup|restore <absolute-private-file>")
  const root = process.cwd(), resolved = path.resolve(file), localPrivate = path.resolve(".data") + path.sep
  if ((resolved === root || resolved.startsWith(root + path.sep)) && !resolved.startsWith(localPrivate)) throw new Error("Backup file must be private and outside release sources")
  const connection = await backupConnection(process.env.DATABASE_URL)
  try {
    const result = action === "backup" ? await backupDatabase(connection, resolved) : await restoreDatabase(connection, resolved, JSON.parse(await fs.readFile(resolved + ".manifest.json", "utf8")).sha256)
    // A path list is private handoff input, never routine terminal output.
    if (action === "backup") { await fs.writeFile(resolved + ".manifest.json", JSON.stringify(result, null, 2), { flag: "wx", mode: 0o600 }); delete result.mediaPaths }
    process.stdout.write(JSON.stringify(result) + "\n")
  } finally { await connection.end() }
}
