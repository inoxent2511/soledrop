import { ALL_PERMISSIONS, PERMISSIONS, PRESET_ROLES, isSensitive } from "@/server/admin/permissions"
import { hashToken, newToken } from "@/server/admin/crypto"
import { createMysqlAdminRepository } from "@/server/admin/mysql.repository"
import { systemActor } from "@/server/db/actor"
import { authTransaction } from "@/server/db/auth.repository"
import { closeDatabase } from "@/server/db/client"
import { uuidv7 } from "@/server/db/uuid"

const args = process.argv.slice(2)
const option = (name: string) => { const index = args.indexOf("--" + name); return index < 0 ? undefined : args[index + 1] }
const email = option("email")?.trim().toLowerCase()
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) throw new Error("Usage: pnpm admin:create-owner --email you@example.com")
const databaseUrl = new URL(process.env.DATABASE_URL ?? "")
if (!["127.0.0.1", "localhost", "[::1]"].includes(databaseUrl.hostname)) throw new Error("Owner bootstrap only connects to a loopback database. Run it locally or over SSH.")
const secret = process.env.AUTH_SECRET ?? process.env.SESSION_SECRET
if (!secret || secret.length < 32 || secret.startsWith("local-")) throw new Error("Configure a stable private AUTH_SECRET before creating an Owner.")
const storeId = process.env.STORE_ID ?? "00000000-0000-4000-8000-000000000001"
const site = new URL(option("site") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3200")
if (!["http:", "https:"].includes(site.protocol) || site.username || site.password) throw new Error("Invalid storefront URL")
const actor = systemActor(storeId, "bootstrap", ALL_PERMISSIONS), repo = createMysqlAdminRepository(), token = newToken()
try {
  await authTransaction(actor, async () => {
    await repo.syncRegistry(actor, storeId, ALL_PERMISSIONS.map((key) => ({ key, label: PERMISSIONS[key].label, group: PERMISSIONS[key].group, sensitive: isSensitive(key) })), PRESET_ROLES)
    if (await repo.countActiveOwners(actor, storeId)) throw new Error("An active Owner already exists. Invite additional staff from Staff & roles.")
    const at = new Date().toISOString()
    for (const invite of await repo.listInvites(actor, storeId)) if (invite.roleKey === "owner" && !invite.acceptedAt && !invite.revokedAt) await repo.updateInvite(actor, invite.id, { revokedAt: at })
    await repo.createInvite(actor, { id: uuidv7(), storeId, email, roleKey: "owner", tokenHash: hashToken(token), invitedBy: null, createdAt: at, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), acceptedAt: null, revokedAt: null })
  })
  process.stdout.write("One-time Owner set-password link (24 hours, mandatory authenticator enrolment): " + new URL("/admin/invite/" + token, site).href + "\n")
} finally { await closeDatabase() }
