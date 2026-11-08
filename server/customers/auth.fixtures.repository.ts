import "server-only"
import { fixtureActorPolicy } from "@/server/db/fixtures-policy.repository"

import type { CustomerAuthRepository, CustomerSecurity } from "./auth"
import { requireCustomerOwner, requireStore, requireSystem, type Actor } from "@/server/db/actor"
import { db, transaction } from "@/server/fixtures/store"
import { DomainError } from "@/server/shared/errors"
import { sameTokenHash } from "@/server/admin/crypto"

const empty = (): CustomerSecurity => ({ emailVerifiedAt: null, failedLogins: 0, lockedUntil: null })
function owner(actor: Actor, customerId: string) {
  const customer = db().customers.find((row) => row.id === customerId && row.storeId === actor.storeId && !row.deletionRequestedAt)
  if (!customer) throw new DomainError("not_found", "Account not found.")
  return customer
}

export function createFixturesCustomerAuthRepository(): CustomerAuthRepository {
  return fixtureActorPolicy<CustomerAuthRepository>({
    async security(actor, customerId) {
      requireSystem(actor, ["auth:customer", "migration"]); owner(actor, customerId)
      const row = db().customerSecurity?.find((entry) => entry.customerId === customerId) ?? empty()
      return { emailVerifiedAt: row.emailVerifiedAt, failedLogins: row.failedLogins, lockedUntil: row.lockedUntil }
    },
    async loginResult(actor, customerId, success) {
      requireSystem(actor, ["auth:customer"])
      return transaction((tables) => {
        owner(actor, customerId)
        const rows = tables.customerSecurity ??= []
        let row = rows.find((entry) => entry.customerId === customerId)
        if (!row) { row = { ...empty(), customerId }; rows.push(row) }
        if (row.lockedUntil && Date.parse(row.lockedUntil) > Date.now()) return structuredClone(row)
        row.failedLogins = success ? 0 : (row.lockedUntil ? 0 : row.failedLogins) + 1
        row.lockedUntil = row.failedLogins >= 5 ? new Date(Date.now() + 900_000).toISOString() : null
        return structuredClone(row)
      })
    },
    async createToken(actor, token) {
      requireSystem(actor, ["auth:customer"]); requireStore(actor, token.storeId)
      transaction((tables) => {
        if (owner(actor, token.identityId).email !== token.email) throw new DomainError("conflict", "The account email changed. Please try again.")
        const rows = tables.customerTokens ??= []
        if (rows.some((row) => row.tokenHash === token.tokenHash)) throw new DomainError("conflict", "Token already exists.")
        rows.push(structuredClone(token))
      })
    },
    async consumeToken(actor, kind, tokenHash, browserHash) {
      requireSystem(actor, ["auth:customer"])
      return transaction((tables) => {
        const row = tables.customerTokens?.find((entry) => entry.storeId === actor.storeId && entry.kind === kind && entry.tokenHash === tokenHash && !entry.usedAt && Date.parse(entry.expiresAt) > Date.now())
        if (!row || !tables.customers.some((customer) => customer.storeId === actor.storeId && customer.id === row.identityId && customer.email === row.email && !customer.deletionRequestedAt)) return null
        if (kind === "magic_link" && (!row.browserHash || !browserHash || !sameTokenHash(row.browserHash, browserHash))) return null
        row.usedAt = new Date().toISOString()
        return structuredClone(row)
      })
    },
    async verifyEmail(actor, customerId, email) {
      requireSystem(actor, ["auth:customer"])
      transaction((tables) => {
        if (owner(actor, customerId).email !== email) throw new DomainError("conflict", "The account email changed. Please request a new link.")
        const rows = tables.customerSecurity ??= []
        const row = rows.find((entry) => entry.customerId === customerId)
        if (row) row.emailVerifiedAt = new Date().toISOString()
        else rows.push({ ...empty(), customerId, emailVerifiedAt: new Date().toISOString() })
      })
    },
    async sessions(actor, customerId, currentTokenHash) {
      requireCustomerOwner(actor, customerId); owner(actor, customerId)
      return db().sessions.filter((row) => row.customerId === customerId && Date.parse(row.expiresAt) > Date.now()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((row) => ({ id: row.tokenHash, createdAt: row.createdAt, expiresAt: row.expiresAt, current: row.tokenHash === currentTokenHash }))
    },
    async revokeSession(actor, customerId, sessionId) {
      requireCustomerOwner(actor, customerId); owner(actor, customerId)
      transaction((tables) => { tables.sessions = tables.sessions.filter((row) => row.customerId !== customerId || row.tokenHash !== sessionId) })
    },
    async saveOAuthState(actor, state) {
      requireSystem(actor, ["auth:customer"]); requireStore(actor, state.storeId)
      transaction((tables) => {
        const rows = tables.oauthStates ??= []
        if (rows.some((row) => row.tokenHash === state.tokenHash)) throw new DomainError("conflict", "Token already exists.")
        rows.push({ ...structuredClone(state), usedAt: null })
      })
    },
    async takeOAuthState(actor, tokenHash, browserHash) {
      requireSystem(actor, ["auth:customer"])
      return transaction((tables) => {
        const row = tables.oauthStates?.find((entry) => entry.storeId === actor.storeId && entry.tokenHash === tokenHash && !entry.usedAt && Date.parse(entry.expiresAt) > Date.now())
        if (!row || !sameTokenHash(row.browserHash, browserHash)) return null
        row.usedAt = new Date().toISOString()
        return { tokenHash, storeId: actor.storeId, browserHash, sealedProof: row.sealedProof, expiresAt: row.expiresAt }
      })
    },
    async oauthCustomer(actor, provider, subject) {
      requireSystem(actor, ["auth:customer"])
      const row = db().oauthAccounts?.find((entry) => entry.storeId === actor.storeId && entry.provider === provider && entry.subject === subject)
      return row && db().customers.some((customer) => customer.storeId === actor.storeId && customer.id === row.customerId && !customer.deletionRequestedAt) ? row.customerId : null
    },
    async linkOAuth(actor, customerId, provider, subject) {
      requireSystem(actor, ["auth:customer"])
      transaction((tables) => {
        owner(actor, customerId)
        const rows = tables.oauthAccounts ??= []
        if (rows.some((row) => row.provider === provider && row.subject === subject)) throw new DomainError("conflict", "This identity is already connected.")
        rows.push({ storeId: actor.storeId, customerId, provider, subject })
      })
    },
  })
}
