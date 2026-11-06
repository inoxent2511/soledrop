import { defineConfig } from "@playwright/test"
import path from "node:path"
import base from "../playwright.config"

/** Run against an isolated QA server; these tests deliberately change shared homepage content. */
export default defineConfig({
  ...base,
  testDir: "./specs",
  testMatch: "banners.spec.ts",
  outputDir: "./out/banners",
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  reporter: [["list"], ["json", { outputFile: path.join(import.meta.dirname, "out/banners-results.json") }]],
  use: { ...base.use, baseURL: process.env.QA_BASE_URL ?? "http://127.0.0.1:3201" },
})
