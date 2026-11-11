import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
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
// pnpm's traced virtual store contains these runtime packages, but Next's top-level package
// links may be materialized when a host copies the output. Make their resolution independent of
// the original virtual-store path.
const modules = path.join(standalone, "node_modules")
const virtualAliases = path.join(modules, ".pnpm", "node_modules")
if (fs.existsSync(virtualAliases)) {
  const packages = fs.readdirSync(virtualAliases).flatMap(name =>
    name.startsWith("@")
      ? fs.readdirSync(path.join(virtualAliases, name)).map(child => path.join(name, child))
      : [name],
  )
  for (const name of packages) {
    const source = path.join(virtualAliases, name)
    const resolved = fs.realpathSync(source)
    if (!resolved.startsWith(standalone + path.sep)) throw new Error("Runtime package escaped the artifact: " + name)
    const target = path.join(modules, name)
    if (fs.existsSync(target)) continue
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.cpSync(source, target, { recursive: true, dereference: true })
  }
}
// Runtime dependencies are traced by Next. Private merchant files are never packaging inputs.
const local = fs.existsSync(".env.local") ? parseEnv(fs.readFileSync(".env.local", "utf8")) : {}
verifyStandalone(standalone, { ...local, ...process.env })
// A boot from the repository can accidentally resolve missing packages in the parent
// node_modules. Exercise the copied output from an independent directory instead.
const portableRoot = fs.mkdtempSync(path.join(os.tmpdir(), "soledrop-runtime-check-"))
try {
  const copy = path.join(portableRoot, "standalone")
  fs.cpSync(standalone, copy, { recursive: true, dereference: true })
  const requireRuntime = createRequire(path.join(copy, "server.js"))
  for (const module of ["next/dist/server/config.js", "next/dist/server/next.js"]) {
    const resolved = requireRuntime.resolve(module)
    if (!resolved.startsWith(copy + path.sep)) throw new Error("Runtime dependency resolved outside the artifact: " + module)
    requireRuntime(module)
  }
} finally {
  const temp = fs.realpathSync(os.tmpdir())
  if (path.dirname(fs.realpathSync(portableRoot)) !== temp || !path.basename(portableRoot).startsWith("soledrop-runtime-check-")) throw new Error("Refusing unsafe portable-check cleanup")
  fs.rmSync(portableRoot, { recursive: true, force: true })
}
process.stdout.write("Standalone server, public assets and static chunks prepared.\n")
