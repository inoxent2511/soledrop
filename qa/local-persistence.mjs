import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import sharp from "sharp"

import { LocalStore } from "../server/db/local-store.ts"
import { prepareStandalone } from "./standalone.mjs"

// Destructive QA runs exclusively on a private copy, never on the user's saved store.
process.loadEnvFile(".env.local")
const source = path.resolve(process.env.LOCAL_DATA_DIR ?? ".data/store")
const credentials = JSON.parse(fs.readFileSync(path.join(source, "owner-bootstrap.json"), "utf8"))
const directory = path.resolve(`.data/qa-store-${randomUUID()}`)
fs.cpSync(source, directory, { recursive: true, filter: (file) => path.basename(file) !== "store.lock" })
const standalone = prepareStandalone("persistence")
const port = "3203"
const base = `http://127.0.0.1:${port}`
const log = fs.openSync("qa/local-persistence.log", "w")
let server
let exited
let cookie = ""
const checks = []
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex")

async function start() {
  server = spawn(process.execPath, ["server.js"], { cwd: standalone, stdio: ["ignore", log, log], env: { ...process.env, NODE_ENV: "production", DATA_DRIVER: "local", LOCAL_DATA_DIR: directory, ADMIN_DEMO_STAFF: "off", HOSTNAME: "127.0.0.1", PORT: port, COOKIE_SECURE: "false" } })
  exited = new Promise((resolve) => server.once("exit", resolve))
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error("QA server exited; inspect qa/local-persistence.log")
    try { if ((await fetch(`${base}/api/health`)).ok) return } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("QA server did not start.")
}
async function stop() {
  if (server?.exitCode === null) { server.kill(); await exited }
}
async function api(url, { method = "GET", data, form, status = 200 } = {}) {
  const response = await fetch(base + url, { method, headers: { origin: base, cookie, "x-forwarded-for": "198.18.244.71", ...(data !== undefined && { "content-type": "application/json" }) }, body: form ?? (data === undefined ? undefined : JSON.stringify(data)) })
  assert.equal(response.status, status, `${method} ${url}`)
  if (response.headers.getSetCookie().length) cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ")
  return status === 204 ? null : response.json()
}
async function page(url, status = 200) {
  const response = await fetch(base + url)
  assert.equal(response.status, status, url)
  return response.text()
}

try {
  await start()
  await api("/api/admin/auth/login", { method: "POST", data: { email: credentials.email, password: credentials.password } })
  // Redeem a recovery code only in the copied database; the real Owner's codes stay untouched.
  await api("/api/admin/auth/mfa/verify", { method: "POST", data: { code: credentials.recoveryCodes[0] } })
  const initial = await api("/api/admin/products?size=100")
  const initialOrders = await api("/api/admin/orders?size=100")
  for (const order of initialOrders.orders) {
    const detail = await api(`/api/admin/orders/${order.number}`)
    for (const line of detail.order.lines) {
      const id = /^\/media\/([0-9a-f-]{36})\.webp$/.exec(line.imageUrl)?.[1]
      if (id) assert.ok((await api(`/api/admin/media/${id}`)).usedBy.includes("Order history"))
    }
  }
  const originalHome = (await api("/api/admin/content/home")).home
  for (const row of initial.rows) {
    const detail = await api(`/api/admin/products/${row.id}`)
    for (const image of detail.product.images) {
      assert.match(image.url, /^\/media\/[0-9a-f-]{36}\.webp$/)
      assert.equal((await fetch(base + image.url)).status, 200)
    }
  }
  assert.equal((await fetch(`${base}/images/products/nike-air-max-card.png`)).status, 404)
  checks.push("Imported catalogue uses saved media; legacy product files are absent")
  const png = await sharp({ create: { width: 640, height: 320, channels: 3, background: "purple" } }).png().toBuffer()
  const form = new FormData()
  form.set("file", new Blob([png], { type: "image/png" }), "persistence-qa.png")
  const { item: image } = await api("/api/admin/media", { method: "POST", form, status: 201 })
  const bytesHash = createHash("sha256").update(new Uint8Array(await (await fetch(base + image.url)).arrayBuffer())).digest("hex")
  const { brands } = await api("/api/admin/brands")
  const suffix = randomUUID().slice(0, 8)
  const input = { title: `Persistence QA ${suffix}`, slug: `qa-persist-${suffix}`, brandId: brands[0].id, kind: "new", gender: "unisex", condition: null, conditionNotes: null, description: "Local persistence QA", tags: [], collections: [], seo: {}, images: [{ url: image.url, alt: "Persistence QA image", width: image.width, height: image.height, role: "card" }], variants: [{ sku: `QA-PERSIST-${suffix}`, size: { eu: "42", uk: "8", us: "9", cm: "27" }, weightGrams: 900, price: 1400000, compareAt: null }] }
  const saved = await api("/api/admin/products", { method: "POST", data: input, status: 201 })
  let detail = await api(`/api/admin/products/${saved.id}`)
  await api(`/api/admin/products/${saved.id}/status`, { method: "POST", data: { status: "active", expectedUpdatedAt: detail.updatedAt } })
  const variant = detail.product.variants[0]
  await api(`/api/admin/inventory/${variant.id}`, { method: "POST", data: { delta: 5, reason: "Received QA stock" } })
  const home = await api("/api/admin/content/home", { method: "PUT", data: { content: { ...originalHome.content, announcement: "Persistent QA announcement", slides: [{ src: image.url, alt: "Persistent QA hero" }] }, expectedUpdatedAt: originalHome.updatedAt } })
  const { collections } = await api("/api/admin/collections")
  const collection = collections.find((row) => row.slug === "new-arrivals")
  await api(`/api/admin/collections/${collection.id}`, { method: "PUT", data: { ...collection, image: { url: image.url, alt: "Persistent QA page banner", width: image.width, height: image.height }, productIds: null } })
  await api(`/api/admin/media/${image.id}`, { method: "DELETE", status: 409 })
  assert.ok((await page("/")).includes("Persistent QA announcement"))
  assert.ok((await page("/new-arrivals")).includes("Persistent QA page banner"))
  assert.ok((await page(`/products/${input.slug}`)).includes(input.title))
  detail = await api(`/api/admin/products/${saved.id}`)
  const beforeRestart = digest(detail)
  await stop(); await start()
  // A saved session, uploaded bytes, stock, prices and page changes must all survive a hard restart.
  assert.equal(digest(await api(`/api/admin/products/${saved.id}`)), beforeRestart)
  assert.equal((await api(`/api/admin/products/${saved.id}`)).stock[variant.id].onHand, 5)
  assert.equal(createHash("sha256").update(new Uint8Array(await (await fetch(base + image.url)).arrayBuffer())).digest("hex"), bytesHash)
  assert.equal((await api("/api/admin/content/home")).home.updatedAt, home.updatedAt)
  assert.equal(digest(await api("/api/admin/orders?size=100")), digest(initialOrders))
  assert.ok((await page("/")).includes("Persistent QA announcement"))
  assert.ok((await page("/new-arrivals")).includes("Persistent QA page banner"))
  checks.push("Hard restart preserves staff session, upload bytes, prices, stock, homepage, page banners and existing orders")
  const renamed = { ...input, title: `${input.title} updated`, slug: `${input.slug}-updated`, variants: [{ ...input.variants[0], id: variant.id }], expectedUpdatedAt: detail.updatedAt }
  await api(`/api/admin/products/${saved.id}`, { method: "PUT", data: renamed })
  await page(`/products/${input.slug}`, 404)
  assert.ok((await page(`/products/${renamed.slug}`)).includes(renamed.title))
  await api(`/api/admin/products/${saved.id}`, { method: "PUT", data: { ...renamed, title: "Stale edit" }, status: 409 })
  detail = await api(`/api/admin/products/${saved.id}`)
  await api(`/api/admin/products/${saved.id}/status`, { method: "POST", data: { status: "draft", expectedUpdatedAt: detail.updatedAt } })
  await page(`/products/${renamed.slug}`, 404)
  assert.ok(!(await page("/")).includes(renamed.title))
  await api(`/api/admin/products/${saved.id}`, { method: "DELETE", data: { reason: "Completed isolated QA" }, status: 204 })
  await api(`/api/admin/media/${image.id}`, { method: "DELETE", status: 409 })
  await api("/api/admin/content/home", { method: "PUT", data: { content: originalHome.content, expectedUpdatedAt: home.updatedAt } })
  await api(`/api/admin/collections/${collection.id}`, { method: "PUT", data: { ...collection, productIds: null } })
  await api(`/api/admin/media/${image.id}`, { method: "DELETE", status: 204 })
  await page(image.url, 404)
  await stop(); await start()
  assert.equal((await api("/api/admin/products?size=100")).total, initial.total)
  await api(`/api/admin/products/${saved.id}`, { status: 404 })
  await page(image.url, 404)
  checks.push("Rename, stale-save rejection, unpublish and deletion persist without restoring static products")
  await stop()
  const empty = new LocalStore(directory, () => { throw new Error("Saved QA store missing") })
  await empty.run((tables) => { tables.products = []; tables.prices = []; tables.inventory = [] })
  await empty.close(); await start()
  assert.equal((await api("/api/admin/products?size=100")).total, 0)
  for (const url of ["/", "/new-arrivals", "/sale", "/pre-loved", "/collections/men", "/search?q=shoes"]) await page(url)
  checks.push("Empty catalogue renders safely and never refills from fixtures")
  fs.writeFileSync(".data/local-qa-result.json", JSON.stringify({ at: new Date().toISOString(), passed: checks.length, checks }, null, 2), { mode: 0o600 })
  console.log(checks.map((check) => `PASS ${check}`).join("\n"))
} finally { await stop(); fs.closeSync(log) }
