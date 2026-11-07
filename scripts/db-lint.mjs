import { migrationFiles } from "./database-common.mjs"

const files = await migrationFiles()
for (const file of files) {
  if (/\b(?:CREATE\s+TRIGGER|DEFINER\s*=|gen_random_uuid|TIMESTAMPTZ|RETURNING|ON\s+CONFLICT)\b/i.test(file.source)) throw new Error("Nonportable SQL in " + file.name)
  if (/\bDROP\s+(TABLE|DATABASE|COLUMN)\b/i.test(file.source)) throw new Error("Destructive migration requires an explicit reviewed data-preservation design: " + file.name)
  for (const statement of file.statements.filter((sql) => /^CREATE TABLE/i.test(sql))) {
    if (!/ENGINE=InnoDB/i.test(statement) || !/COLLATE=utf8mb4_unicode_ci/i.test(statement)) throw new Error("Missing portable table options")
    if (/\bTIMESTAMP\b/i.test(statement.replaceAll("CURRENT_TIMESTAMP", ""))) throw new Error("Use DATETIME(3)")
  }
}
process.stdout.write("Portable migration lint passed: " + files.length + " files.\n")
