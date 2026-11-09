/** Validate immutable forward history and the effective final table defaults. */
export function lintMigrations(files) {
  const collations = new Map()
  for (const file of files) {
    if (/\b(?:CREATE\s+TRIGGER|DEFINER\s*=|gen_random_uuid|TIMESTAMPTZ|RETURNING|ON\s+CONFLICT)\b/i.test(file.source)) throw new Error("Nonportable SQL in " + file.name)
    if (/\bDROP\s+(TABLE|DATABASE|COLUMN)\b/i.test(file.source)) throw new Error("Destructive migration requires an explicit reviewed data-preservation design: " + file.name)
    for (const statement of file.statements) {
      const create = statement.match(/^CREATE TABLE(?: IF NOT EXISTS)?\s+`?([a-z_]+)`?/i)
      if (create) {
        const collation = statement.match(/\bCOLLATE\s*=\s*(\w+)\s*$/i)?.[1]?.toLowerCase()
        if (!/\bENGINE\s*=\s*InnoDB\b/i.test(statement) || !/\bCHARSET\s*=\s*utf8mb4\b/i.test(statement) || !["utf8mb4_unicode_ci", "utf8mb4_bin"].includes(collation)) throw new Error("Missing portable table options")
        if (/\bTIMESTAMP\b/i.test(statement.replaceAll("CURRENT_TIMESTAMP", ""))) throw new Error("Use DATETIME(3)")
        collations.set(create[1], collation)
      }
      const alter = statement.match(/^ALTER TABLE\s+`?([a-z_]+)`?\s+DEFAULT CHARACTER SET\s+utf8mb4\s+COLLATE\s*(?:=\s*)?(\w+)\s*$/i)
      if (alter) collations.set(alter[1], alter[2].toLowerCase())
    }
  }
  for (const [table, collation] of collations) if (collation !== "utf8mb4_unicode_ci") throw new Error("Final table default must be utf8mb4_unicode_ci: " + table)
}
