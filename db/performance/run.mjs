import fs from "node:fs/promises"
import { spawn } from "node:child_process"
import { performance } from "node:perf_hooks"
import { createConnection } from "mysql2/promise"

function unindexedScans(plan) {
  const found = []
  const visit = (node) => {
    if (!node || typeof node !== "object") return
    const rows = Number(node.rows_examined_per_scan ?? node.rows ?? 0)
    if (node.table_name && !node.table_name.startsWith("<") && node.access_type === "ALL" && rows >= 1000 && !node.materialized_from_subquery && !node.materialized) found.push({ table: node.table_name, rows })
    for (const value of Object.values(node)) if (value && typeof value === "object") visit(value)
  }
  visit(plan)
  return found
}

const configs = JSON.parse(await fs.readFile(".data/performance/connections.json", "utf8"))
const engine = process.argv.find((arg) => arg.startsWith("--engine="))?.slice(9)
if (!engine) {
  let failed = false
  for (const selected of ["mysql", "mariadb"]) {
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, ["--conditions=react-server", "--import", "./scripts/register.mjs", "db/performance/run.mjs", "--engine=" + selected], { stdio: "inherit", windowsHide: true })
      child.on("exit", resolve); child.on("error", () => resolve(1))
    })
    if (code !== 0) failed = true
  }
  process.exitCode = failed ? 1 : 0
} else {
  if (!["mysql", "mariadb"].includes(engine) || !configs[engine]?.ready) throw new Error("Both isolated datasets must be prepared first")
  const config = configs[engine], url = new URL(config.appUrl)
  if (url.hostname !== "127.0.0.1" || !/^\/soledrop_qa_perf[a-f0-9]{10}$/.test(url.pathname)) throw new Error("Only task-owned synthetic loopback databases are accepted")
  const budgets = JSON.parse(await fs.readFile("db/tests/performance-budgets.json", "utf8"))
  Object.assign(process.env, { DATABASE_URL: config.appUrl, DATABASE_POOL_MAX: String(budgets.poolMax), DATA_DRIVER: "mysql", NODE_ENV: "test" })
  const { database, databaseStatus, closeDatabase } = await import("../../server/db/client.ts")
  const { anonymousActor, systemActor } = await import("../../server/db/actor.ts")
  const { ALL_PERMISSIONS } = await import("../../server/admin/permissions.ts")
  const { createMysqlStorefrontRepository } = await import("../../server/catalog/storefront.mysql.repository.ts")
  const { createMysqlOrderRepository } = await import("../../server/orders/mysql.repository.ts")
  const db = await database(), inspector = await createConnection(config.appUrl)
  let captured = []
  const session = Reflect.get(db, "session"), original = Reflect.get(session, "client")
  Reflect.set(session, "client", new Proxy(original, { get(target, property) {
    const method = Reflect.get(target, property)
    if (typeof method !== "function") return method
    if (property === "query" || property === "execute") return (...args) => {
      captured.push({ sql: typeof args[0] === "string" ? args[0] : args[0].sql, params: args[1] ?? [] })
      return Reflect.apply(method, target, args)
    }
    return method.bind(target)
  } }))
  const products = createMysqlStorefrontRepository(), orders = createMysqlOrderRepository()
  const visitor = anonymousActor(config.storeId), worker = systemActor(config.storeId, "migration", ALL_PERMISSIONS)
  const listing = (query) => () => products.selectPage(visitor, config.storeId, { pageSize: 24, ...query }, [config.listId], undefined, new Map())
  const orderList = (query) => () => orders.search(worker, config.storeId, { page: 1, pageSize: 50, ...query })
  // Representative cases were established with the fixed budgets, before tuning.
  const cases = [
    { name: "products-featured", category: "productListing", total: 100000, read: listing({}) },
    { name: "products-newest", category: "productListing", total: 100000, read: listing({ sort: "newest" }) },
    { name: "products-price", category: "productListing", total: 100000, read: listing({ sort: "price-asc" }) },
    { name: "search-brand", category: "productSearch", total: 12500, read: listing({ q: "nike" }) },
    { name: "search-sku", category: "productSearch", total: 1, read: listing({ q: "PF-50000-0" }) },
    { name: "search-typo", category: "productSearch", total: 100000, read: listing({ q: "runnre" }) },
    { name: "orders-newest", category: "orderListing", total: 500000, read: orderList({}) },
    { name: "orders-status", category: "orderListing", total: 100000, read: orderList({ status: ["confirmed"] }) },
    { name: "orders-number", category: "orderSearch", total: 1, read: orderList({ q: "SD500001" }) },
    { name: "orders-email", category: "orderSearch", total: 50, read: orderList({ q: "buyer4999@performance.example.test" }) },
    { name: "orders-total", category: "orderListing", total: 500000, read: orderList({ sort: "total_desc" }) },
  ]
  const report = { engine, startedAt: new Date().toISOString(), budgets, dataset: {}, results: [], pass: false }
  const output = ".data/performance/" + engine + "-acceptance-" + Date.now() + ".json"
  const save = () => fs.writeFile(output, JSON.stringify(report, null, 2))
  try {
    report.database = await databaseStatus()
    for (const [table, expected] of Object.entries(budgets.dataset)) {
      if (!["products", "variants", "orders"].includes(table)) throw new Error("Unexpected dataset table")
      const [[row]] = await inspector.query("SELECT COUNT(*) AS total FROM `" + table + "`")
      report.dataset[table] = Number(row.total)
      if (Number(row.total) !== expected) throw new Error("Unexpected synthetic " + table + " count")
    }
    for (const item of cases) {
      const measured = [], cold = [], result = { name: item.name, category: item.category, budgetMs: budgets.p95Ms[item.category], warmupsMs: [], samplesMs: [], plans: [], coldPlans: [], pass: false }
      report.results.push(result)
      try {
        for (let sample = -budgets.warmups; sample < budgets.samples; sample++) {
          captured = []
          const start = performance.now(), page = await item.read(), duration = performance.now() - start
          const rows = page.products ?? page.orders
          if (page.total !== item.total || rows.length !== Math.min(item.total, page.products ? 24 : 50)) throw new Error("Incorrect synthetic result in " + item.name)
          if (sample >= 0) result.samplesMs.push(Math.round(duration * 100) / 100)
          else result.warmupsMs.push(Math.round(duration * 100) / 100)
          if (sample === 0) measured.push(...captured)
          if (sample === -budgets.warmups) cold.push(...captured)
        }
        const sorted = [...result.samplesMs].sort((a, b) => a - b)
        result.p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1]
        result.p50Ms = sorted[Math.ceil(sorted.length * 0.5) - 1]
        for (const entry of measured) {
          const [rows] = await inspector.query("EXPLAIN FORMAT=JSON " + entry.sql, entry.params)
          result.plans.push({ sql: entry.sql, plan: JSON.parse(String(Object.values(rows[0])[0])) })
        }
        for (const entry of cold) {
          const [rows] = await inspector.query("EXPLAIN FORMAT=JSON " + entry.sql, entry.params)
          result.coldPlans.push({ sql: entry.sql, plan: JSON.parse(String(Object.values(rows[0])[0])) })
        }
        result.unindexedScans = [...result.plans, ...result.coldPlans].flatMap((entry) => unindexedScans(entry.plan))
        result.pass = result.p95Ms <= result.budgetMs && result.unindexedScans.length === 0
      } catch (error) { result.error = error.message }
      await save()
      process.stdout.write(JSON.stringify({ engine, name: result.name, p95Ms: result.p95Ms, budgetMs: result.budgetMs, pass: result.pass, ...(result.error ? { error: result.error } : {}) }) + "\n")
    }
    report.pass = report.results.every((item) => item.pass)
    report.finishedAt = new Date().toISOString()
    await save()
    if (!report.pass) process.exitCode = 1
    process.stdout.write(JSON.stringify({ engine, pass: report.pass, report: output }) + "\n")
  } finally { await inspector.end(); await closeDatabase() }
}
