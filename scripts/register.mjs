// Node 22.18+ source-script resolver (built-in TypeScript stripping); app code is built by Next.
import fs from "node:fs"
import { registerHooks } from "node:module"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.join(root, specifier.slice(2))
    const file = [`${base}.ts`, path.join(base, "index.ts")].find((candidate) => fs.existsSync(candidate))
    if (!file) throw new Error(`No server script module: ${specifier}`)
    return nextResolve(pathToFileURL(file).href, context)
  }
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const base = fileURLToPath(new URL(specifier, context.parentURL))
    const relative = path.relative(root, base)
    if (!relative.startsWith("..") && !relative.split(path.sep).includes("node_modules") && (!fs.existsSync(base) || fs.statSync(base).isDirectory())) {
      const file = [`${base}.ts`, path.join(base, "index.ts")].find((candidate) => fs.existsSync(candidate))
      if (file) return nextResolve(pathToFileURL(file).href, context)
    }
  }
  return nextResolve(specifier, context)
} })
