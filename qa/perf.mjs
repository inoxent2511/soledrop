#!/usr/bin/env node
/**
 * Lab performance budgets (E1) for the key routes, measured in Chromium with the Lighthouse mobile
 * profile: 390 px, 4x CPU slowdown, 150 ms RTT, 1.6 Mbps down / 750 kbps up. Lighthouse itself is
 * not a dependency, so the metrics come from the browser's own observers:
 *   LCP  largest-contentful-paint (last entry before the first input)
 *   CLS  layout-shift session windows (max window, excluding shifts after input)
 *   INP  event-timing duration of a real tap on the route's main control
 *   JS   compressed bytes of every script loaded before `load` (first-load JS)
 *   The report also records all script bytes through interaction, including deferred panels.
 * Budgets: Core Web Vitals "good" (LCP ≤ 2500 ms, CLS ≤ 0.1, INP ≤ 200 ms) and JS ≤ 200 KB.
 * Usage: node qa/perf.mjs [--base=http://127.0.0.1:3200]   Writes qa/out/perf.json; exits 1 over budget.
 */
import { chromium } from "@playwright/test"
import fs from "node:fs"

const base = process.argv.find((arg) => arg.startsWith("--base="))?.slice(7) ?? process.env.QA_BASE_URL ?? "http://127.0.0.1:3200"
const BUDGET = { lcp: 2500, cls: 0.1, inp: 200, js: 200 * 1024 }
const RUNS = 3

/** Each route with the control a shopper taps first (for INP). */
const ROUTES = [
  { route: "/", tap: { role: "button", name: "Open menu" } },
  { route: "/collections/new-arrivals", tap: { role: "button", name: "Open menu" } },
  { route: "/products/asics-gel-kayano-30-black-silver", tap: { role: "radio", name: "42" } },
  { route: "/pre-loved", tap: { role: "button", name: "Open menu" } },
  { route: "/search?q=nike", tap: { role: "button", name: "Search" } },
  { route: "/cart", tap: { role: "button", name: "Search" } },
  { route: "/contact", tap: { role: "button", name: "Send message" } },
]

function observe() {
  window.__perf = { lcp: 0, cls: 0, inp: 0 }
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime
  }).observe({ type: "largest-contentful-paint", buffered: true })
  let windowValue = 0
  let windowStart = 0
  let last = 0
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue
      if (entry.startTime - last > 1000 || entry.startTime - windowStart > 5000) {
        windowValue = 0
        windowStart = entry.startTime
      }
      windowValue += entry.value
      last = entry.startTime
      window.__perf.cls = Math.max(window.__perf.cls, windowValue)
    }
  }).observe({ type: "layout-shift", buffered: true })
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (entry.interactionId) window.__perf.inp = Math.max(window.__perf.inp, entry.duration)
  }).observe({ type: "event", buffered: true, durationThreshold: 16 })
}

async function measure(browser, { route, tap }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send("Network.enable")
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true })
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 })
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  const scripts = new Map()
  const allScripts = new Map()
  let loaded = false
  cdp.on("Network.responseReceived", (event) => {
    if (event.type === "Script") allScripts.set(event.requestId, 0)
    if (!loaded && event.type === "Script") scripts.set(event.requestId, 0)
  })
  cdp.on("Network.loadingFinished", (event) => {
    if (scripts.has(event.requestId)) scripts.set(event.requestId, event.encodedDataLength)
    if (allScripts.has(event.requestId)) allScripts.set(event.requestId, event.encodedDataLength)
  })
  await page.addInitScript(observe)
  await page.goto(base + route, { waitUntil: "load" })
  loaded = true
  const js = [...scripts.values()].reduce((sum, bytes) => sum + bytes, 0)
  // Hydrated: React has attached its fiber to the header (as e2e/support/panels.ts waits).
  await page.waitForFunction(() => Object.keys(document.querySelector("header") ?? {}).some((key) => key.startsWith("__reactFiber")))
  await page.waitForTimeout(1500)
  const before = await page.evaluate(() => ({ ...window.__perf }))
  const control = page.getByRole(tap.role, { name: tap.name, exact: true }).first()
  // Size radios sit visually hidden inside their chip label; a finger lands on the label.
  await (tap.role === "radio" ? page.locator("label").filter({ has: control }).first() : control).tap()
  await page.waitForTimeout(1000)
  const after = await page.evaluate(() => ({ ...window.__perf }))
  await context.close()
  return { lcp: before.lcp, cls: before.cls, inp: after.inp, js, totalJs: [...allScripts.values()].reduce((sum, bytes) => sum + bytes, 0) }
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

const browser = await chromium.launch()
const results = []
for (const target of ROUTES) {
  const runs = []
  for (let run = 0; run < RUNS; run += 1) runs.push(await measure(browser, target))
  const result = {
    route: target.route,
    lcp: Math.round(median(runs.map((run) => run.lcp))),
    cls: Number(median(runs.map((run) => run.cls)).toFixed(3)),
    inp: Math.round(median(runs.map((run) => run.inp))),
    jsBytes: median(runs.map((run) => run.js)),
    jsKb: Math.round(median(runs.map((run) => run.js)) / 1024),
    jsAfterInteractionKb: Math.round(median(runs.map((run) => run.totalJs)) / 1024),
  }
  result.pass = result.lcp <= BUDGET.lcp && result.cls <= BUDGET.cls && result.inp <= BUDGET.inp && result.jsBytes <= BUDGET.js
  results.push(result)
  console.log(`${result.pass ? "PASS" : "OVER"} ${target.route.padEnd(44)} LCP ${result.lcp} ms · CLS ${result.cls} · INP ${result.inp} ms · JS ${result.jsKb} KB`)
}
await browser.close()
fs.mkdirSync("qa/out", { recursive: true })
fs.writeFileSync("qa/out/perf.json", JSON.stringify({ generatedAt: new Date().toISOString(), base, budget: BUDGET, runs: RUNS, profile: "390px, 4x CPU, 150ms RTT, 1.6Mbps", results }, null, 2))
if (results.some((result) => !result.pass)) process.exitCode = 1
