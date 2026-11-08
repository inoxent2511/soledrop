import fs from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"
import { pathToFileURL } from "node:url"

/**
 * Fail the build if tracing copied private runtime data or embedded real environment secrets.
 * @param {string} directory
 * @param {Record<string, string | undefined>} environment
 */
export function verifyStandalone(directory, environment = process.env) {
  const root = fs.realpathSync(directory), findings = []
  const secrets = Object.entries(environment).filter(([key, value]) => /SECRET|PASSWORD|SMTP_PASS|DATABASE_URL|API_KEYS|S3_ACCESS_KEY/.test(key) && typeof value === "string" && value.length >= 16)
  const visited = new Set()
  let scanned = 0
  function walk(location) {
    const resolved = fs.realpathSync(location)
    if (resolved !== root && !resolved.startsWith(root + path.sep)) { findings.push("External artifact link: " + path.relative(root, location)); return }
    if (visited.has(resolved)) return
    visited.add(resolved)
    for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
      const file = path.join(resolved, entry.name), relative = path.relative(root, file)
      if ([".data", ".git", ".email-outbox"].includes(entry.name) || /^\.env(?:\.|$)/.test(entry.name)) findings.push("Private runtime path: " + relative)
      if (entry.isSymbolicLink()) {
        const target = fs.realpathSync(file)
        if (target !== root && !target.startsWith(root + path.sep)) findings.push("External artifact link: " + relative)
        else if (fs.statSync(target).isDirectory()) walk(target)
      } else if (entry.isDirectory()) walk(file)
      else if (/\.(?:js|mjs|cjs|json|html|txt)$/.test(entry.name)) {
        const text = fs.readFileSync(file, "utf8"); scanned++
        for (const [key, value] of secrets) if (text.includes(value)) findings.push("Embedded " + key + ": " + relative)
      }
    }
  }
  walk(root)
  if (findings.length) throw new Error("Artifact privacy verification failed:\n" + findings.join("\n"))
  return { scanned, findings: 0 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const local = fs.existsSync(".env.local") ? parseEnv(fs.readFileSync(".env.local", "utf8")) : {}
  process.stdout.write(JSON.stringify(verifyStandalone(path.resolve(process.argv[2] ?? ".next/standalone"), { ...local, ...process.env })) + "\n")
}
