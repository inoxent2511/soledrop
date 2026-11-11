#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local")
const standalone = path.resolve(".next/standalone")
if (!fs.existsSync(path.join(standalone, "server.js"))) throw new Error("Run pnpm build:standalone first.")
if (!fs.existsSync(path.join(standalone, "public")) || !fs.existsSync(path.join(standalone, ".next/static"))) throw new Error("Run pnpm build:standalone to package static assets.")
process.env.NODE_ENV = "production"
process.env.PORT = process.argv[2] ?? process.env.PORT ?? "3000"
process.env.HOSTNAME ??= "0.0.0.0"
process.env.LOCAL_DATA_DIR = path.resolve(process.env.LOCAL_DATA_DIR ?? ".data/store")
// Use the host's single supervised process; Next handles HTTP signals and the pool drains itself.
await import(pathToFileURL(path.join(standalone, "server.js")).href)
