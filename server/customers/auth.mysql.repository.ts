import "server-only"
import { mysqlPolicy } from "@/server/db/policy.repository"
import type { ActorBound } from "@/server/db/actor"

import { and, desc, eq, getTableColumns, gt, isNull } from "drizzle-orm"
import type { CustomerAuthRepository, CustomerSecurity } from "./auth"
import { type Actor, requireCustomerOwner, requireStore, requireSystem } from "@/server/db/actor"
import { type Database, database, withTransaction } from "@/server/db/client"
import { authTokens, customerSecurity, customers, oauthAccounts, sessions } from "@/server/db/schema"
import { isoDate, nullableIsoDate, sqlDate, sqlNow } from "@/server/db/values"
import { DomainError } from "@/server/shared/errors"
import { sameTokenHash } from "@/server/admin/crypto"
import { uuidv7 } from "@/server/db/uuid"
import { authTransaction } from "@/server/db/auth.repository"

async function lockCustomer(db: Database, actor: Actor, customerId: string) {
  const [row] = await db.select().from(customers).where(and(eq(customers.storeId, actor.storeId), eq(customers.id, customerId), isNull(customers.deletionRequestedAt))).for("update")
  if (!row) throw new DomainError("not_found", "Account not found.")
  return row
}

const security = (row?: typeof customerSecurity.$inferSelect): CustomerSecurity => ({ emailVerifiedAt: nullableIsoDate(row?.emailVerifiedAt ?? null), failedLogins: row?.failedLogins ?? 0, lockedUntil: nullableIsoDate(row?.lockedUntil ?? null) })

export function createMysqlCustomerAuthRepository(): CustomerAuthRepository {
  return mysqlPolicy<ActorBound<CustomerAuthRepository>>({
    async security(actor, customerId) {
      requireSystem(actor, ["auth:customer", "migration"])
      const db = await database()
      const [row] = await db.select(getTableColumns(customerSecurity)).from(customerSecurity).innerJoin(customers, eq(customers.id, customerSecurity.customerId)).where(and(eq(customers.storeId, actor.storeId), eq(customerSecurity.customerId, customerId))).limit(1)
      return security(row)
    },
    async loginResult(actor, customerId, success) {
      requireSystem(actor, ["auth:customer"])
      return authTransaction(actor, () => withTransaction(async (db) => {
        await lockCustomer(db, actor, customerId)
        const [current] = await db.select().from(customerSecurity).where(eq(customerSecurity.customerId, customerId)).for("update")
        const locked = current?.lockedUntil && Date.parse(isoDate(current.lockedUntil)) > Date.now()
        if (locked) return security(current)
        const failures = success ? 0 : (current?.lockedUntil ? 0 : current?.failedLogins ?? 0) + 1
        const values = { customerId, emailVerifiedAt: current?.emailVerifiedAt ?? null, failedLogins: failures, lockedUntil: failures >= 5 ? sqlDate(new Date(Date.now() + 900_000).toISOString()) : null }
        await db.insert(customerSecurity).values(values).onDuplicateKeyUpdate({ set: values })
        return security(values)
      }))
    },
    async createToken(actor, token) {
      requireSystem(actor, ["auth:customer"]); requireStore(actor, token.storeId)
      await withTransaction(async (db) => {
        const owner = await lockCustomer(db, actor, token.identityId)
        if (owner.email !== token.email) throw new DomainError("conflict", "The account email changed. Please try again.")
        await db.insert(authTokens).values({ tokenHash: token.tokenHash, storeId: token.storeId, identityId: token.identityId, email: token.email, kind: token.kind, payload: { browserHash: token.browserHash }, expiresAt: sqlDate(token.expiresAt), usedAt: null })
      })
    },
    async consumeToken(actor, kind, tokenHash, browserHash) {
      requireSystem(actor, ["auth:customer"])
      return withTransaction(async (db) => {
        const where = and(eq(authTokens.storeId, actor.storeId), eq(authTokens.kind, kind), eq(authTokens.tokenHash, tokenHash), isNull(authTokens.usedAt), gt(authTokens.expiresAt, sqlNow()))
        const [row] = await db.select().from(authTokens).where(where).for("update")
        if (!row?.identityId || !row.email) return null
        const bound = row.payload && typeof row.payload === "object" && "browserHash" in row.payload ? row.payload.browserHash : null
        if (kind === "magic_link" && (typeof bound !== "string" || !browserHash || !sameTokenHash(bound, browserHash))) return null
        const [owner] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, row.identityId), eq(customers.storeId, actor.storeId), eq(customers.email, row.email), isNull(customers.deletionRequestedAt))).for("update")
        if (!owner) return null
        const usedAt = new Date().toISOString()
        await db.update(authTokens).set({ usedAt: sqlDate(usedAt) }).where(where)
        return { tokenHash, storeId: actor.storeId, kind, identityId: owner.id, email: row.email, browserHash: typeof bound === "string" ? bound : null, expiresAt: isoDate(row.expiresAt), usedAt }
      })
    },
    async verifyEmail(actor, customerId, email) {
      requireSystem(actor, ["auth:customer"])
      await withTransaction(async (db) => {
        const owner = await lockCustomer(db, actor, customerId)
        if (owner.email !== email) throw new DomainError("conflict", "The account email changed. Please request a new link.")
        const values = { customerId, emailVerifiedAt: sqlNow() }
        await db.insert(customerSecurity).values(values).onDuplicateKeyUpdate({ set: { emailVerifiedAt: values.emailVerifiedAt } })
      })
    },
    async sessions(actor, customerId, currentTokenHash) {
      requireCustomerOwner(actor, customerId)
      const db = await database()
      return (await db.select(getTableColumns(sessions)).from(sessions).innerJoin(customers, eq(customers.id, sessions.customerId)).where(and(eq(customers.storeId, actor.storeId), eq(customers.id, customerId), gt(sessions.expiresAt, sqlNow()))).orderBy(desc(sessions.createdAt))).map((row) => ({ id: row.tokenHash, createdAt: isoDate(row.createdAt), expiresAt: isoDate(row.expiresAt), current: row.tokenHash === currentTokenHash }))
    },
    async revokeSession(actor, customerId, sessionId) {
      requireCustomerOwner(actor, customerId)
      await withTransaction(async (db) => {
        await lockCustomer(db, actor, customerId)
        await db.delete(sessions).where(and(eq(sessions.customerId, customerId), eq(sessions.tokenHash, sessionId)))
      })
    },
    async saveOAuthState(actor, state) {
      requireSystem(actor, ["auth:customer"]); requireStore(actor, state.storeId)
      const db = await database()
      await db.insert(authTokens).values({ tokenHash: state.tokenHash, storeId: state.storeId, kind: "oauth_state", payload: { browserHash: state.browserHash, sealedProof: state.sealedProof }, expiresAt: sqlDate(state.expiresAt) })
    },
    async takeOAuthState(actor, tokenHash, browserHash) {
      requireSystem(actor, ["auth:customer"])
      return withTransaction(async (db) => {
        const where = and(eq(authTokens.storeId, actor.storeId), eq(authTokens.kind, "oauth_state"), eq(authTokens.tokenHash, tokenHash), isNull(authTokens.usedAt), gt(authTokens.expiresAt, sqlNow()))
        const [row] = await db.select().from(authTokens).where(where).for("update")
        const payload = row?.payload
        if (!payload || typeof payload !== "object" || !("browserHash" in payload) || !("sealedProof" in payload) || typeof payload.browserHash !== "string" || typeof payload.sealedProof !== "string" || !sameTokenHash(payload.browserHash, browserHash)) return null
        await db.update(authTokens).set({ usedAt: sqlNow() }).where(where)
        return { tokenHash, storeId: actor.storeId, browserHash, sealedProof: payload.sealedProof, expiresAt: isoDate(row.expiresAt) }
      })
    },
    async oauthCustomer(actor, provider, subject) {
      requireSystem(actor, ["auth:customer"])
      const db = await database()
      const [row] = await db.select({ id: customers.id }).from(oauthAccounts).innerJoin(customers, eq(customers.id, oauthAccounts.customerId)).where(and(eq(customers.storeId, actor.storeId), eq(oauthAccounts.provider, provider), eq(oauthAccounts.subject, subject), isNull(customers.deletionRequestedAt))).limit(1)
      return row?.id ?? null
    },
    async linkOAuth(actor, customerId, provider, subject) {
      requireSystem(actor, ["auth:customer"])
      await withTransaction(async (db) => {
        await lockCustomer(db, actor, customerId)
        await db.insert(oauthAccounts).values({ id: uuidv7(), customerId, provider, subject })
      })
    },
  })
}
