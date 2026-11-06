import { randomBytes, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

// Run from the repository, once, after exporting the live preview. Never resets an existing store.
const root = process.cwd()
const destination = path.resolve(root, ".data/store")
const directory = path.resolve(root, `.data/migration-staging-${randomUUID()}`)
const backupDirectory = path.resolve(root, ".data/migration-backup")
if (fs.existsSync(destination)) throw new Error("The destination already exists. Refusing to overwrite it.")
const backup = JSON.parse(fs.readFileSync(path.join(backupDirectory, "preview.json"), "utf8"))
if (backup.data["/api/admin/customers?size=100"]?.body.total !== 0) throw new Error("This preview importer expects no customer accounts; use a complete account migration for a store with customers.")
const audit = backup.data["/api/admin/audit?size=100"]
if (audit?.status !== 200 || audit.body.total !== audit.body.entries.length) throw new Error("A complete audit export is required to retain saved flag choices and audited stock history.")
if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local")
else {
  fs.writeFileSync(".env.local", [
    "DATA_DRIVER=local", `LOCAL_DATA_DIR=${destination.replaceAll("\\", "/")}`,
    `SESSION_SECRET=${randomBytes(48).toString("base64url")}`, `JOBS_SECRET=${randomBytes(32).toString("base64url")}`,
    "ADMIN_DEMO_STAFF=off", "COOKIE_SECURE=false", "NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3200", "",
  ].join("\n"), { flag: "wx", mode: 0o600 })
  process.loadEnvFile(".env.local")
}
const { serverEnv } = await import("@/lib/env.server")
if (serverEnv.DATA_DRIVER !== "local" || path.resolve(serverEnv.LOCAL_DATA_DIR) !== destination) throw new Error("Migration requires DATA_DRIVER=local and LOCAL_DATA_DIR=.data/store (or its absolute path).")
const { LocalStore } = await import("@/server/db/local-store")
const { migrateCatalogue, restorePreviewMetadata } = await import("@/server/db/migrate-catalogue")
const { createLocalTables } = await import("@/server/fixtures/store")
const { attributeDefinitions, customFieldDefinitions } = await import("@/server/fixtures/seed")
const { commerceSeed } = await import("@/server/fixtures/commerce-seed")
const { homeSeed } = await import("@/server/fixtures/home-seed")
const { hashPassword } = await import("@/server/customers/password")
const { generateTotpSecret, otpauthUri } = await import("@/server/admin/totp")
const { seal, newRecoveryCodes, hashToken } = await import("@/server/admin/crypto")

const tables = createLocalTables()
tables.attributeDefinitions = structuredClone(attributeDefinitions)
tables.customFieldDefinitions = structuredClone(customFieldDefinitions)
const summary = await migrateCatalogue(tables, backup, structuredClone(homeSeed), directory, (url) => {
  const asset = backup.assets?.[url]
  if (asset) {
    const file = path.resolve(backupDirectory, "assets", asset.file)
    if (!file.startsWith(path.join(backupDirectory, "assets") + path.sep)) throw new Error("Invalid backup asset path.")
    const bytes = fs.readFileSync(file)
    if (bytes.length !== asset.bytes) throw new Error(`Damaged backup image: ${url}`)
    return new Uint8Array(bytes)
  }
  if (!/^\/images\/(site|products)\/[^/]+$/.test(url)) throw new Error(`Missing backed-up asset: ${url}`)
  const candidates = [path.join(root, "qa/fixtures", url.slice(1)), path.join(root, "public", url.slice(1))]
  const file = candidates.find((candidate) => fs.existsSync(candidate))
  if (!file) throw new Error(`Missing image: ${url}`)
  return new Uint8Array(fs.readFileSync(file))
})
// The previous wholesale list was not editable in the admin; preserve it for surviving variants.
const variants = new Set(tables.products.flatMap((product) => product.variants.map((variant) => variant.id)))
tables.prices.push(...structuredClone(commerceSeed.extraPrices.filter((price) => variants.has(price.variantId))))
tables.audit = audit.body.entries
restorePreviewMetadata(tables)

// Saved stores use a private Owner, rather than known demo accounts.
const password = `${randomBytes(18).toString("base64url")}!a7`
const secret = generateTotpSecret()
const recoveryCodes = newRecoveryCodes()
const at = new Date().toISOString()
const userId = randomUUID()
const email = "owner@soledrop.local"
tables.staffMembers.push({ userId, storeId: serverEnv.STORE_ID, email, displayName: "Owner", status: "active", passwordHash: await hashPassword(password), totpSecret: seal(secret, serverEnv.SESSION_SECRET), totpEnabledAt: at, totpLastStep: null, recoveryCodes: recoveryCodes.map(hashToken), failedLogins: 0, lockedUntil: null, lastSeenAt: null, createdAt: at, updatedAt: at })
const owner = tables.adminRoles.find((role) => role.key === "owner")!
tables.staffRoleLinks.push({ userId, storeId: serverEnv.STORE_ID, roleId: owner.id })
tables.audit.push({ id: randomUUID(), at, actor: "catalogue-migration", action: "catalogue.migrated", entity: "store", entityId: serverEnv.STORE_ID, storeId: serverEnv.STORE_ID, before: null, after: summary })
const credentials = { url: "http://127.0.0.1:3200/admin", email, password, totpSecret: secret, authenticatorUri: otpauthUri(secret, email, "Sole Drop Admin"), recoveryCodes }
fs.mkdirSync(path.resolve(".data"), { recursive: true, mode: 0o700 })
fs.writeFileSync(path.join(directory, "owner-bootstrap.json"), JSON.stringify(credentials, null, 2), { flag: "wx", mode: 0o600 })
const saved = new LocalStore(directory, () => tables)
await saved.close()
fs.renameSync(directory, destination)
fs.writeFileSync(".data/migration-result.json", JSON.stringify({ migratedAt: at, ...summary, staticProductImages: tables.products.flatMap((product) => product.images).filter((image) => !image.url.startsWith("/media/")).length }, null, 2), { mode: 0o600 })
console.log("Catalogue migrated:", summary)
console.log("Private Owner credentials: .data/store/owner-bootstrap.json. Start with pnpm start.")
