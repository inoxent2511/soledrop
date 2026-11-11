import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const command = process.argv[2]
if (command !== "build" && command !== "start") throw new Error("Choose build or start.")

const cli = path.resolve("node_modules/next/dist/bin/next")
if (!fs.existsSync(cli)) throw new Error("Install dependencies before running Next.js.")

const args = [cli, command, ...(command === "build" ? ["--webpack"] : []), "--experimental-next-config-strip-types"]
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: { ...process.env, SOLEDROP_HOSTINGER_COMPAT: "1" },
})

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal))
child.on("error", error => {
  console.error(error)
  process.exitCode = 1
})
child.on("exit", code => {
  process.exitCode = code ?? 1
})
