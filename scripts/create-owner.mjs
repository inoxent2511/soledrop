#!/usr/bin/env node
/** Local/SSH entry point. Only a hashed, expiring invite is written; no plaintext password. */
import fs from "node:fs"
import { spawnSync } from "node:child_process"

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local")
const driver = process.env.DATA_DRIVER ?? "mysql"
if (!["mysql", "local"].includes(driver)) throw new Error("Owner bootstrap requires the mysql driver (or the preserved local migration source).")
const script = driver === "mysql" ? "scripts/create-mysql-owner.ts" : "scripts/create-local-owner.ts"
const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "./scripts/register.mjs", script, ...process.argv.slice(2)], { stdio: "inherit", env: process.env, windowsHide: true })
process.exitCode = result.status ?? 1
