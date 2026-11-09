import { migrationFiles } from "./database-common.mjs"
import { lintMigrations } from "./database-lint.mjs"

const files = await migrationFiles()
lintMigrations(files)
process.stdout.write("Portable migration lint passed: " + files.length + " files.\n")
