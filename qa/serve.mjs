#!/usr/bin/env node
/**
 * Serves the production build exactly as the Docker image does (`output: "standalone"`): copies
 * public/ and .next/static/ into .next/standalone/ and runs its server.js. Local QA only; the
 * secrets below are throwaway values that satisfy the production environment check.
 *
 * Usage: node node_modules/next/dist/bin/next build   then   node qa/serve.mjs [port]   (default 3200)
 */
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const port = process.argv[2] ?? "3200"
const standalone = path.resolve(".next/standalone")
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("No standalone build: run next build first.")
  process.exit(1)
}
fs.cpSync("public", path.join(standalone, "public"), { recursive: true })
fs.cpSync(".next/static", path.join(standalone, ".next/static"), { recursive: true })

const server = spawn(process.execPath, ["server.js"], {
  cwd: standalone,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: port,
    HOSTNAME: "127.0.0.1",
    SESSION_SECRET: "qa-only-session-secret-not-for-deployment-0000",
    JOBS_SECRET: "qa-only-jobs-secret-0000",
    // Plain HTTP on loopback: WebKit would drop Secure cookies here (BUG-010). Deployments keep the default.
    COOKIE_SECURE: "false",
    // DEMO staff accounts for the admin e2e suite (fixtures driver only, A-011).
    ADMIN_DEMO_STAFF: "on",
  },
})
server.on("exit", (code) => process.exit(code ?? 0))
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal))
