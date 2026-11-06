#!/usr/bin/env node
/**
 * Serves the production build exactly as the Docker image does (`output: "standalone"`): copies
 * public/ and .next/static/ into .next/standalone/ and runs its server.js. Local QA only; the
 * secrets below are throwaway values that satisfy the production environment check.
 *
 * Usage: node node_modules/next/dist/bin/next build   then   node qa/serve.mjs [port]   (default 3200)
 */
import { spawn } from "node:child_process"
import { prepareStandalone } from "./standalone.mjs"

const port = process.argv[2] ?? "3200"
if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error("Use a local port from 1024 to 65535.")
const standalone = prepareStandalone(port, true)

const server = spawn(process.execPath, ["server.js"], {
  cwd: standalone,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    DATA_DRIVER: "fixtures",
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
