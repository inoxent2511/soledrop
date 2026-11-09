import fs from "node:fs/promises"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"
import { createConnection } from "mysql2/promise"

const action = process.argv[2]
if (!["up", "down"].includes(action)) throw new Error("Use db-local.mjs up|down")
const docker = spawnSync("docker", ["compose", "version"], { stdio: "ignore", windowsHide: true })
if (docker.status === 0) {
  if (!process.env.LOCAL_DB_ROOT_PASSWORD) throw new Error("Set LOCAL_DB_ROOT_PASSWORD before starting Docker databases")
  const args = ["compose", "-f", "db/compose.yml", action === "up" ? "up" : "stop"]
  if (action === "up") args.push("-d", "--wait")
  const child = spawn("docker", args, { stdio: "inherit", windowsHide: true })
  child.on("exit", (code) => { process.exitCode = code ?? 1 })
} else {
  const configPath = path.resolve(".data/local-engines/instances.json")
  let instances
  try { instances = JSON.parse(await fs.readFile(configPath, "utf8")) } catch { throw new Error("Docker unavailable. Configure initialized portable instances in ignored .data/local-engines/instances.json; see db/README.md") }
  for (const instance of instances) {
    if (instance.host !== "127.0.0.1" || ![3307, 3308].includes(instance.port)) throw new Error("Portable engines must use task-owned loopback ports")
    const connect = () => createConnection({ host: instance.host, port: instance.port, user: "root", password: instance.rootPassword, connectTimeout: 1000 })
    if (action === "down") {
      const connection = await connect()
      try { await connection.query("SHUTDOWN") } finally { await connection.end() }
      continue
    }
    let existing
    try { existing = await connect() } catch (error) { if (error.code !== "ECONNREFUSED") throw error }
    if (existing) { await existing.end(); continue }
    const binary = path.resolve(instance.binary), data = path.resolve(instance.data)
    const root = path.resolve(".data/local-engines") + path.sep
    if (!binary.startsWith(root) || !data.startsWith(root)) throw new Error("Portable paths must stay within ignored local tooling")
    const log = await fs.open(path.join(root, instance.engine + ".log"), "a")
    const args = ["--no-defaults", "--basedir=" + path.dirname(path.dirname(binary)), "--datadir=" + data, "--bind-address=127.0.0.1", "--port=" + instance.port, "--character-set-server=utf8mb4", "--collation-server=utf8mb4_unicode_ci", "--default-time-zone=+00:00", "--console"]
    if (instance.engine === "mysql") args.push("--mysqlx=OFF")
    const child = spawn(binary, args, { detached: true, windowsHide: true, stdio: ["ignore", log.fd, log.fd] })
    child.unref()
    await log.close()
    let ready = false
    // A large InnoDB redo recovery can exceed ten seconds after an interrupted
    // local QA session. This bounds service startup, not application query time.
    const startupDeadline = Date.now() + 120_000
    while (Date.now() < startupDeadline) {
      try { const connection = await connect(); await connection.end(); ready = true; break } catch { await delay(200) }
    }
    if (!ready) throw new Error("Portable engine did not become ready: " + instance.engine)
  }
  process.stdout.write("Local engines " + action + ".\n")
}
