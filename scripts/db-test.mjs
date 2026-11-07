import fs from "node:fs/promises"
import { spawn } from "node:child_process"

let connections
if (process.env.DB_TEST_CONNECTIONS) connections = JSON.parse(process.env.DB_TEST_CONNECTIONS)
else connections = JSON.parse(await fs.readFile(".data/local-engines/test-connections.json", "utf8"))
for (const [engine, config] of Object.entries(connections)) {
  if (!["mysql", "mariadb"].includes(engine)) throw new Error("Unknown engine")
  for (const value of Object.values(config)) {
    const url = new URL(value)
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !/^\/soledrop_(test|qa)(_[a-z0-9]+)?$/.test(url.pathname)) throw new Error("Database tests only use task-owned local test databases")
  }
}
const child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "db/vitest.config.ts", ...process.argv.slice(2)], { env: { ...process.env, DB_TEST_CONNECTIONS: JSON.stringify(connections) }, stdio: "inherit", windowsHide: true })
child.on("exit", (code) => { process.exitCode = code ?? 1 })
