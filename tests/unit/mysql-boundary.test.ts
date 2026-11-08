import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

const files = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : entry.name.endsWith(".ts") ? [path.join(directory, entry.name)] : [])
describe("SQL construction boundaries", () => {
  it("keeps domain SQL in repository modules and raw mysql clients in connection infrastructure", () => {
    const exceptions = ["client.ts", "schema.ts", "columns.ts", "uuid.ts"].map((name) => path.join("server", "db", name))
    for (const file of files("server")) {
      const text = fs.readFileSync(file, "utf8")
      if (/from ["']drizzle-orm/.test(text)) expect(file.endsWith(".repository.ts") || exceptions.includes(file), file).toBe(true)
      if (/from ["']mysql2/.test(text)) expect(file, "Raw driver must stay in the pool infrastructure").toBe(path.join("server", "db", "client.ts"))
    }
  })
  it("rejects SQL template interpolation and nonliteral sql.raw fragments", () => {
    for (const file of files("server")) {
      const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true)
      const inspect = (node: ts.Node) => {
        if (ts.isTaggedTemplateExpression(node) && node.tag.getText(source) === "sql") throw new Error(file + ": use Drizzle builders/Param instead of SQL templates")
        if (ts.isCallExpression(node) && node.expression.getText(source) === "sql.raw") expect(node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]), file + ": raw SQL must be a static literal").toBe(true)
        ts.forEachChild(node, inspect)
      }
      inspect(source)
    }
  })
})
