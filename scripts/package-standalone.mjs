import fs from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"
import { verifyStandalone } from "./verify-standalone.mjs"

const root = process.cwd(), standalone = path.resolve(".next/standalone")
if (!fs.existsSync(path.join(standalone, "server.js"))) throw new Error("Build the standalone server first.")
for (const [source, relative] of [["public", "public"], [".next/static", ".next/static"]]) {
  const target = path.resolve(standalone, relative)
  if (!target.startsWith(standalone + path.sep) || !standalone.startsWith(root + path.sep)) throw new Error("Invalid package destination.")
  fs.rmSync(target, { recursive: true, force: true })
  fs.cpSync(path.resolve(source), target, { recursive: true })
}
// Runtime dependencies are traced by Next. Private merchant files are never packaging inputs.
const local = fs.existsSync(".env.local") ? parseEnv(fs.readFileSync(".env.local", "utf8")) : {}
verifyStandalone(standalone, { ...local, ...process.env })
process.stdout.write("Standalone server, public assets and static chunks prepared.\n")
