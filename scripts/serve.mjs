#!/usr/bin/env node
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local")
const standalone = path.resolve(".next/standalone")
if (!fs.existsSync(path.join(standalone, "server.js"))) throw new Error("Run pnpm build first.")
const publicDirectory = path.join(standalone, "public")
// Recreate generated public output so an earlier QA run cannot leave sample product photos behind.
if (!publicDirectory.startsWith(path.resolve(".next") + path.sep)) throw new Error("Invalid standalone public path.")
fs.rmSync(publicDirectory, { recursive: true, force: true })
fs.cpSync("public", publicDirectory, { recursive: true })
fs.cpSync(".next/static", path.join(standalone, ".next/static"), { recursive: true })
const server = spawn(process.execPath, ["server.js"], {
  cwd: standalone, stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production", PORT: process.argv[2] ?? process.env.PORT ?? "3000", HOSTNAME: process.env.HOSTNAME ?? "0.0.0.0", LOCAL_DATA_DIR: path.resolve(process.env.LOCAL_DATA_DIR ?? ".data/store") },
})
server.on("exit", (code) => process.exit(code ?? 0))
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal))
