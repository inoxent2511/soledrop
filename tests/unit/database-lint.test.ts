import { describe, expect, it } from "vitest"
import { lintMigrations } from "../../scripts/database-lint.mjs"
import { statements } from "../../scripts/database-common.mjs"

const file = (source: string) => ({ name: "test.sql", source, statements: statements(source) })
const create = (collation: string) => "CREATE TABLE IF NOT EXISTS example (id INT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=" + collation + ";"
describe("forward SQL lint", () => {
  it("requires the original final collation while retaining immutable corrected history", () => {
    expect(() => lintMigrations([file(create("utf8mb4_bin"))])).toThrow("Final table default")
    expect(() => lintMigrations([file(create("utf8mb4_bin")), file("ALTER TABLE example DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")])).not.toThrow()
    expect(() => lintMigrations([file(create("utf8mb4_unicode_ci")), file("ALTER TABLE example DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;")])).toThrow("Final table default")
  })
  it("retains engine, charset, datetime, destructive-DDL and vendor portability checks", () => {
    const valid = create("utf8mb4_unicode_ci")
    for (const source of [valid.replace("InnoDB", "MyISAM"), valid.replace("CHARSET=utf8mb4", "CHARSET=latin1"), valid.replace("id INT", "at TIMESTAMP"), valid + "DROP TABLE example;", valid + "SELECT gen_random_uuid();"]) expect(() => lintMigrations([file(source)])).toThrow()
    expect(() => lintMigrations([file(valid)])).not.toThrow()
  })
})
