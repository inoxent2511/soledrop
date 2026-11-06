#!/usr/bin/env node
/**
 * Creates a one-time Owner invite in the LOCAL Supabase database and prints its link (A-013).
 *
 *   pnpm admin:create-owner --email you@example.com [--site http://localhost:3000]
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment (or .env.local). Refuses any
 * URL that isn't localhost / 127.0.0.1: production owners are bootstrapped from their own database
 * console (docs/DEPLOYMENT-RUNBOOK.md, "Admin bootstrap"). With DATA_DRIVER=fixtures use the demo
 * accounts instead (ADMIN_DEMO_STAFF=on, A-011).
 */
import { createHash, randomBytes } from "node:crypto"
import fs from "node:fs"

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "")
  }
}
loadEnvFile(".env.local")

const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}

const email = option("email")?.trim().toLowerCase()
const site = option("site") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
const storeId = process.env.STORE_ID ?? "00000000-0000-4000-8000-000000000001"
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Usage: pnpm admin:create-owner --email you@example.com")
  process.exit(1)
}
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (local Supabase). With the fixtures driver, use ADMIN_DEMO_STAFF=on instead.")
  process.exit(1)
}
const host = new URL(url).hostname
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`Refusing to write to ${host}: this script only touches a local database. See the runbook for production.`)
  process.exit(1)
}

const token = randomBytes(32).toString("base64url")
const response = await fetch(`${url}/rest/v1/staff_invites`, {
  method: "POST",
  headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=minimal" },
  body: JSON.stringify({
    store_id: storeId,
    email,
    role_key: "owner",
    token_hash: createHash("sha256").update(token).digest("hex"),
    expires_at: new Date(Date.now() + 24 * 3_600_000).toISOString(),
  }),
})
if (!response.ok) {
  console.error(`Could not create the invite (${response.status}): ${await response.text()}`)
  process.exit(1)
}
console.log(`Owner invite for ${email} (valid 24 hours, one use):\n\n  ${new URL(`/admin/invite/${token}`, site)}\n`)
