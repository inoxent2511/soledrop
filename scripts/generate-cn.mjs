import fs from "node:fs"
import path from "node:path"
import { build } from "cn/build"

// Keep the pinned merger's existing semantics while omitting class groups absent from our code.
const check = process.argv.includes("--check"), output = check ? ".data/generation-check/cn-tables.ts" : "lib/cn-tables.ts"
fs.mkdirSync(path.dirname(output), { recursive: true })
const sources = ["app", "components", "features", "hooks", "context", "lib", "tests"]
const files = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name)
  return entry.isDirectory() ? files(file) : /\.(ts|tsx)$/.test(file) && file !== path.normalize("lib/cn-tables.ts") ? [file] : []
})
const result = await build({ content: sources.flatMap(files).sort(), out: output })
if (check && fs.readFileSync(output, "utf8") !== fs.readFileSync("lib/cn-tables.ts", "utf8")) throw new Error("Class-merger tables are stale. Run pnpm cn:generate.")
console.log(`Class-merger tables ${check ? "in sync" : "generated"}: ${result.usedGroups}/${result.totalGroups} groups.`)
