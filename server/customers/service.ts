import "server-only"

import { createHash, randomBytes } from "node:crypto"

import type { CustomerOperations } from "@/server/customers/repository"
import type { CustomerAuthRepository, CustomerTokenKind } from "@/server/customers/auth"
import { assertPasswordPolicy } from "@/server/customers/password-policy"
import type { Actor } from "@/server/db/actor"
import { decoyHash, hashPassword, passwordNeedsRehash, verifyPassword } from "@/server/customers/password"
import type { Customer, CustomerProfile } from "@/server/customers/types"
import type { Address, Order } from "@/server/orders/types"
import type { EventTopic } from "@/server/platform/types"
import { DomainError } from "@/server/shared/errors"
import { newId, now } from "@/server/shared/ids"
import { direct, type Atomic } from "@/server/shared/atomic"

export const SESSION_DAYS = 30
const RESET_MINUTES = 30

type Deps = {
  customers: CustomerOperations
  publish: (topic: EventTopic, payload: Record<string, unknown>) => Promise<unknown>
  orders: { listForCustomer: (storeId: string, customerId: string) => Promise<Order[]>; anonymiseCustomer: (customerId: string) => Promise<number> }
  rehashPassword?: (customer: Customer, passwordHash: string) => Promise<void>
  atomic?: Atomic
  auth?: { repository: CustomerAuthRepository; actor: () => Actor; magicLinkEnabled: boolean; verificationEnabled: boolean }
  securityEvent?: (customer: Customer, action: string) => Promise<void>
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex")
const newToken = () => randomBytes(32).toString("base64url")

export function toProfile(customer: Customer): CustomerProfile {
  return {
    id: customer.id,
    email: customer.email,
    fullName: customer.fullName,
    phone: customer.phone,
    group: customer.group,
    marketingOptIn: customer.marketingOptIn,
    createdAt: customer.createdAt,
  }
}

export function createCustomerService(deps: Deps) {
  const { customers } = deps
  const atomic = deps.atomic ?? direct

  const extraAuth = () => {
    if (!deps.auth) throw new DomainError("forbidden", "This sign-in option is unavailable.")
    return deps.auth
  }

  async function requestLink(storeId: string, emailAddress: string, kind: CustomerTokenKind, browserNonce?: string) {
    const auth = extraAuth()
    if (kind === "magic_link" ? !auth.magicLinkEnabled : !auth.verificationEnabled) throw new DomainError("forbidden", "This sign-in option is unavailable.")
    if (kind === "magic_link" && (!browserNonce || browserNonce.length < 32)) throw new DomainError("validation", "Start sign-in in this browser first.")
    const customer = await customers.findByEmail(storeId, emailAddress.trim().toLowerCase())
    if (!customer || customer.deletionRequestedAt) return
    const token = newToken()
    await atomic(async () => {
      await auth.repository.createToken(auth.actor(), { tokenHash: hash(token), storeId, kind, identityId: customer.id, email: customer.email, browserHash: browserNonce ? hash(browserNonce) : null, expiresAt: new Date(Date.now() + 900_000).toISOString(), usedAt: null })
      await deps.publish("auth.link_requested", { customerId: customer.id, email: customer.email, kind, token })
    })
  }

  async function startSession(customerId: string) {
    const token = newToken()
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString()
    await customers.createSession({ tokenHash: hash(token), customerId, createdAt: now(), expiresAt })
    return { token, expiresAt }
  }

  return {
    async register(storeId: string, input: { email: string; password: string; fullName: string; marketingOptIn: boolean }) {
      assertPasswordPolicy(input.password)
      return atomic(async () => {
      const customer = await customers.create({
        id: newId(),
        storeId,
        email: input.email.trim().toLowerCase(),
        passwordHash: await hashPassword(input.password),
        fullName: input.fullName.trim(),
        phone: null,
        group: "retail",
        marketingOptIn: input.marketingOptIn,
        createdAt: now(),
        deletionRequestedAt: null,
      })
      await deps.publish("customer.registered", { customerId: customer.id, email: customer.email, fullName: customer.fullName })
      return { customer: toProfile(customer), session: await startSession(customer.id) }
      })
    },

    /** Same error and similar timing for unknown email and wrong password. */
    async login(storeId: string, emailAddress: string, password: string) {
      const customer = await customers.findByEmail(storeId, emailAddress.trim().toLowerCase())
      const valid = await verifyPassword(password, customer?.passwordHash || (await decoyHash()))
      const security = customer && !customer.deletionRequestedAt && deps.auth ? await deps.auth.repository.loginResult(deps.auth.actor(), customer.id, valid) : null
      if (!customer || !valid || customer.deletionRequestedAt || security?.lockedUntil && Date.parse(security.lockedUntil) > Date.now()) {
        if (customer) await deps.securityEvent?.(customer, "customer.login_failed")
        throw new DomainError("unauthorized", "That email and password don't match.")
      }
      return atomic(async () => {
        const current = await customers.findById(customer.id)
        const currentSecurity = deps.auth ? await deps.auth.repository.security(deps.auth.actor(), customer.id) : null
        if (!current || current.deletionRequestedAt || current.passwordHash !== customer.passwordHash || currentSecurity?.lockedUntil && Date.parse(currentSecurity.lockedUntil) > Date.now()) throw new DomainError("unauthorized", "That email and password don't match.")
        if (passwordNeedsRehash(current.passwordHash)) {
          const passwordHash = await hashPassword(password)
          if (deps.rehashPassword) await deps.rehashPassword(current, passwordHash)
          else await customers.update(current.id, { passwordHash }, current.passwordHash)
        }
        await deps.securityEvent?.(customer, "customer.signed_in")
        return { customer: toProfile(customer), session: await startSession(customer.id) }
      })
    },

    logout: (token: string) => customers.deleteSession(hash(token)),

    /** Resolves a session cookie to its customer; null for expired, unknown or deleted accounts. */
    async fromSession(token: string | undefined): Promise<Customer | null> {
      if (!token) return null
      const session = await customers.findSession(hash(token))
      if (!session) return null
      const customer = await customers.findById(session.customerId)
      return customer && !customer.deletionRequestedAt ? customer : null
    },

    /** Always succeeds from the caller's view, so it can't be used to discover accounts. */
    async requestPasswordReset(storeId: string, emailAddress: string) {
      const customer = await customers.findByEmail(storeId, emailAddress.trim().toLowerCase())
      if (!customer || customer.deletionRequestedAt) return
      const token = newToken()
      await atomic(async () => {
      await customers.createReset({ tokenHash: hash(token), customerId: customer.id, expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000).toISOString(), usedAt: null })
      await deps.publish("password.reset_requested", { customerId: customer.id, email: customer.email, token })
      })
    },

    async resetPassword(token: string, password: string) {
      assertPasswordPolicy(password)
      const passwordHash = await hashPassword(password)
      return atomic(async () => {
      const reset = await customers.consumeReset(hash(token))
      if (!reset) throw new DomainError("validation", "This reset link has expired or was already used. Ask for a new one.")
      await customers.update(reset.customerId, { passwordHash })
      await customers.deleteSessionsFor(reset.customerId)
      const customer = await customers.findById(reset.customerId)
      if (customer) {
        await deps.securityEvent?.(customer, "customer.password_reset")
        await deps.publish("auth.security_changed", { email: customer.email, action: "password_reset" })
      }
      return startSession(reset.customerId)
      })
    },

    async changePassword(customer: Customer, current: string, next: string) {
      assertPasswordPolicy(next)
      if (!(await verifyPassword(current, customer.passwordHash))) throw new DomainError("validation", "Your current password is incorrect.", { field: "currentPassword" })
      return atomic(async () => {
      await customers.update(customer.id, { passwordHash: await hashPassword(next) }, customer.passwordHash)
      await customers.deleteSessionsFor(customer.id)
      await deps.securityEvent?.(customer, "customer.password_changed")
      await deps.publish("auth.security_changed", { email: customer.email, action: "password_changed" })
      return startSession(customer.id)
      })
    },

    requestMagicLink: (storeId: string, email: string, browserNonce: string) => requestLink(storeId, email, "magic_link", browserNonce),
    requestVerification: (storeId: string, email: string) => requestLink(storeId, email, "verify_email"),

    /** Called only with claims verified by the configured OIDC adapter, never request JSON. */
    fromVerifiedOAuth(input: { provider: string; subject: string; email: string; fullName: string; linkedCustomerId: string | null }) {
      const auth = extraAuth(), actor = auth.actor()
      return atomic(async () => {
        let customerId = await auth.repository.oauthCustomer(actor, input.provider, input.subject)
        if (customerId && input.linkedCustomerId && customerId !== input.linkedCustomerId) throw new DomainError("conflict", "This identity is already connected to a different account.")
        if (!customerId) {
          const existing = await customers.findByEmail(actor.storeId, input.email)
          if (existing && existing.id !== input.linkedCustomerId) throw new DomainError("conflict", "Sign in with your password before connecting this identity.")
          if (input.linkedCustomerId) {
            const linked = await customers.findById(input.linkedCustomerId)
            if (!linked || linked.deletionRequestedAt || linked.email !== input.email) throw new DomainError("forbidden", "Sign in to the matching account before connecting this identity.")
            customerId = linked.id
          } else {
            const customer = await customers.create({ id: newId(), storeId: actor.storeId, email: input.email, fullName: input.fullName, passwordHash: "", phone: null, group: "retail", marketingOptIn: false, createdAt: now(), deletionRequestedAt: null })
            customerId = customer.id
            await deps.publish("customer.registered", { customerId, email: customer.email, fullName: customer.fullName })
          }
          await auth.repository.linkOAuth(actor, customerId, input.provider, input.subject)
          await auth.repository.verifyEmail(actor, customerId, input.email)
        }
        const customer = await customers.findById(customerId)
        if (!customer || customer.deletionRequestedAt) throw new DomainError("unauthorized", "Please sign in to continue.")
        await deps.securityEvent?.(customer, "customer.oauth_signed_in")
        return { customer: toProfile(customer), session: await startSession(customerId) }
      })
    },

    async redeemLink(token: string, kind: CustomerTokenKind, browserNonce?: string) {
      const auth = extraAuth()
      if (kind === "magic_link" ? !auth.magicLinkEnabled : !auth.verificationEnabled) throw new DomainError("forbidden", "This sign-in option is unavailable.")
      return atomic(async () => {
        const record = await auth.repository.consumeToken(auth.actor(), kind, hash(token), browserNonce ? hash(browserNonce) : null)
        if (!record) throw new DomainError("validation", "This link has expired or was already used. Ask for a new one.")
        await auth.repository.verifyEmail(auth.actor(), record.identityId, record.email)
        const customer = await customers.findById(record.identityId)
        if (!customer || customer.deletionRequestedAt) throw new DomainError("unauthorized", "Please sign in to continue.")
        await deps.securityEvent?.(customer, kind === "magic_link" ? "customer.magic_signed_in" : "customer.email_verified")
        // Verifying an email is not a login: it must never create an authenticated cookie.
        return { customer: toProfile(customer), session: kind === "magic_link" ? await startSession(record.identityId) : null }
      })
    },

    listSessions(customer: Customer, currentToken: string) {
      const auth = extraAuth()
      return auth.repository.sessions(auth.actor(), customer.id, hash(currentToken))
    },

    revokeSession(customer: Customer, sessionId: string) {
      const auth = extraAuth()
      return atomic(async () => {
        await auth.repository.revokeSession(auth.actor(), customer.id, sessionId)
        await deps.securityEvent?.(customer, "customer.session_revoked")
      })
    },

    async changeEmail(customer: Customer, password: string, emailAddress: string) {
      if (!(await verifyPassword(password, customer.passwordHash))) throw new DomainError("validation", "Your current password is incorrect.", { field: "currentPassword" })
      const email = emailAddress.trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) throw new DomainError("validation", "Enter a valid email address.")
      return atomic(async () => {
        const updated = await customers.update(customer.id, { email }, customer.passwordHash)
        await customers.deleteSessionsFor(customer.id)
        await deps.securityEvent?.(customer, "customer.email_changed")
        await deps.publish("auth.security_changed", { email: customer.email, action: "email_changed" })
        return { customer: toProfile(updated), session: await startSession(customer.id) }
      })
    },

    async updateProfile(customerId: string, changes: { fullName?: string; phone?: string | null; marketingOptIn?: boolean }) {
      return toProfile(await customers.update(customerId, changes))
    },

    listAddresses: (customerId: string) => customers.listAddresses(customerId),
    saveAddress: (customerId: string, address: Address & { id?: string; isDefault: boolean }) => customers.saveAddress(customerId, address),
    deleteAddress: (customerId: string, addressId: string) => customers.deleteAddress(customerId, addressId),

    /** Right of access: everything held about the customer, as JSON. */
    async exportData(customer: Customer) {
      const [addresses, orders] = await Promise.all([customers.listAddresses(customer.id), deps.orders.listForCustomer(customer.storeId, customer.id)])
      return {
        exportedAt: now(),
        profile: toProfile(customer),
        addresses,
        orders: orders.map(({ accessTokenHash: _hidden, idempotencyKey: _key, ...order }) => order),
      }
    },

    /** Right to erasure: scrub the profile and anonymise orders (amounts stay for accounting). */
    async deleteAccount(customer: Customer, password: string) {
      if (!(await verifyPassword(password, customer.passwordHash))) throw new DomainError("validation", "Your password is incorrect.", { field: "password" })
      await atomic(async () => {
        await deps.orders.anonymiseCustomer(customer.id)
        await customers.scrub(customer.id, customer.passwordHash)
        await deps.securityEvent?.(customer, "customer.deleted")
      })
    },
  }
}

export type CustomerService = ReturnType<typeof createCustomerService>
