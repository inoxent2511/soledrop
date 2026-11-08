import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"

export const migrationDirectory = path.resolve("db/migrations")
export const ledgerSql = "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(190) NOT NULL PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
export const strictSqlMode = "STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION"

/** Delimiters/comments/quoted semicolons are parsed rather than split blindly. */
export function statements(source) {
  const result = []
  let statement = "", quote = "", lineComment = false, blockComment = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i], next = source[i + 1]
    if (lineComment) { if (char === "\n") { lineComment = false; statement += "\n" }; continue }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; i++ }; continue }
    if (quote) {
      statement += char
      if (char === "\\" && next) statement += source[++i]
      else if (char === quote) {
        if (next === quote) statement += source[++i]
        else quote = ""
      }
      continue
    }
    if (char === "-" && next === "-" && /\s/.test(source[i + 2] ?? "")) { lineComment = true; i++; continue }
    if (char === "#") { lineComment = true; continue }
    if (char === "/" && next === "*") { blockComment = true; i++; continue }
    if (["'", '"', "`"].includes(char)) { quote = char; statement += char; continue }
    if (char === ";") { if (statement.trim()) result.push(statement.trim()); statement = "" }
    else statement += char
  }
  if (quote || blockComment) throw new Error("Unterminated SQL quote/comment")
  if (statement.trim()) result.push(statement.trim())
  return result
}

export async function migrationFiles(directory = migrationDirectory) {
  const files = (await fs.readdir(directory)).filter((name) => name.endsWith(".sql")).sort()
  if (!files.length || files.some((name) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(name))) throw new Error("Invalid migration filenames")
  if (new Set(files.map((name) => name.slice(0, 4))).size !== files.length) throw new Error("Duplicate migration sequence")
  return Promise.all(files.map(async (name) => {
    const bytes = await fs.readFile(path.join(directory, name))
    // Canonical line endings make a Windows checkout and Linux artifact identical.
    const source = bytes.toString("utf8").replaceAll("\r\n", "\n")
    return { name, source, checksum: createHash("sha256").update(source).digest("hex"), statements: statements(source) }
  }))
}

export { supportedEngine } from "./database-engine.mjs"

export async function configureConnection(connection) {
  await connection.query("SET SESSION time_zone = '+00:00'")
  await connection.execute("SET SESSION sql_mode = ?", [strictSqlMode])
  await connection.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci")
  await connection.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ")
}
