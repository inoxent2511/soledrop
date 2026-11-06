import { serverEnv } from "@/lib/env.server"
import { hashToken, newToken } from "@/server/admin/crypto"
import { closeLocalStore, localStore } from "@/server/fixtures/store"
import { randomUUID } from "node:crypto"

const args = process.argv.slice(2)
const value = (flag: string) => { const at = args.indexOf(`--${flag}`); return at < 0 ? undefined : args[at + 1] }
const email = value("email")?.trim().toLowerCase()
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Usage: pnpm admin:create-owner --email you@example.com")
if (serverEnv.DATA_DRIVER !== "local") throw new Error("This bootstrap is for a saved local store.")
if (serverEnv.SESSION_SECRET.startsWith("local-")) throw new Error("Configure a private SESSION_SECRET in .env.local first; it must stay stable across restarts.")
const token = newToken()
try {
  await localStore().run((tables) => {
    const owner = tables.adminRoles.find((role) => role.key === "owner")!
    if (tables.staffMembers.some((member) => member.status === "active" && tables.staffRoleLinks.some((link) => link.userId === member.userId && link.roleId === owner.id))) throw new Error("An Owner already exists. Use Staff & roles to invite another member.")
    const at = new Date().toISOString()
    tables.staffInvites.push({ id: randomUUID(), storeId: serverEnv.STORE_ID, email, roleKey: "owner", tokenHash: hashToken(token), invitedBy: null, expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(), acceptedAt: null, revokedAt: null, createdAt: at })
  })
  console.log(`One-time Owner invite (24 hours): ${new URL(`/admin/invite/${token}`, value("site") ?? "http://127.0.0.1:3200")}`)
} finally { await closeLocalStore() }
