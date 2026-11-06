import fs from "node:fs"
import path from "node:path"

/** Independent caches and public assets, sharing only the build's read-only dependencies. */
export function prepareStandalone(label, fixtures = false) {
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Invalid QA label.")
  const built = path.resolve(".next/standalone")
  if (!fs.existsSync(path.join(built, "server.js"))) throw new Error("Run pnpm build first.")
  const directory = path.resolve(`.data/qa-build-${label}-${process.pid}`)
  if (fs.existsSync(directory)) throw new Error("QA output already exists; never overwriting an active server.")
  fs.cpSync(built, directory, { recursive: true, filter: (source) => path.basename(source) !== "node_modules" && source !== path.join(built, "public") })
  for (const relative of ["node_modules", ".next/node_modules"]) if (fs.existsSync(path.join(built, relative))) fs.symlinkSync(path.join(built, relative), path.join(directory, relative), process.platform === "win32" ? "junction" : "dir")
  fs.cpSync("public", path.join(directory, "public"), { recursive: true })
  if (fixtures) fs.cpSync("qa/fixtures/images", path.join(directory, "public/images"), { recursive: true })
  fs.cpSync(".next/static", path.join(directory, ".next/static"), { recursive: true })
  return directory
}
