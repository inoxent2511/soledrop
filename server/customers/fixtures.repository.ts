import "server-only"

import type { CustomerOperations, CustomerRepository } from "@/server/customers/repository"
import { db, transaction } from "@/server/fixtures/store"
import { DomainError } from "@/server/shared/errors"
import { newId, now } from "@/server/shared/ids"
import { fixturePolicy } from "@/server/db/fixtures-policy.repository"
import { type Actor, requireCustomerOwner, requireFreshGrant, requireGrant, requireStore, requireSystem } from "@/server/db/actor"
import type { Customer } from "@/server/customers/types"

const customerProjection = (actor: Actor, customer: Customer): Customer => {
  const own = actor.kind === "customer" || actor.kind === "system" && ["auth:customer", "migration"].includes(actor.purpose)
  const pii = own || actor.permissions.includes("customers:read_pii")
  return { ...customer, passwordHash: own ? customer.passwordHash : "", email: pii ? customer.email : customer.email.slice(0, 1) + "•••@" + customer.email.split("@").at(-1), phone: pii || !customer.phone ? customer.phone : "•••" + customer.phone.replace(/\D/g, "").slice(-3) }
}

function existingCustomer(actor: Actor, id: string) {
  if (!db().customers.some((row) => row.id === id && row.storeId === actor.storeId)) throw new DomainError("not_found", "Account not found.")
}

export function createFixturesCustomerRepository(): CustomerRepository {
  const operations: CustomerOperations = {
    async findByEmail(storeId, email) {
      return structuredClone(db().customers.find((row) => row.storeId === storeId && row.email === email.toLowerCase()) ?? null)
    },
    async findById(id) {
      return structuredClone(db().customers.find((row) => row.id === id) ?? null)
    },
    async create(customer) {
      return transaction((tables) => {
        if (tables.customers.some((row) => row.storeId === customer.storeId && row.email === customer.email)) {
          throw new DomainError("conflict", "An account with this email already exists.")
        }
        tables.customers.push(customer)
        return structuredClone(customer)
      })
    },
    async update(id, changes, expectedPasswordHash) {
      return transaction((tables) => {
        const customer = tables.customers.find((row) => row.id === id)
        if (!customer) throw new DomainError("not_found", "Account not found.")
        if (expectedPasswordHash !== undefined && customer.passwordHash !== expectedPasswordHash) throw new DomainError("unauthorized", "Your credentials changed. Please sign in again.")
        if (changes.email && tables.customers.some((row) => row.id !== id && row.storeId === customer.storeId && row.email === changes.email)) {
          throw new DomainError("conflict", "An account with this email already exists.")
        }
        Object.assign(customer, changes)
        if (changes.email !== undefined) {
          const security = tables.customerSecurity?.find((row) => row.customerId === id)
          if (security) security.emailVerifiedAt = null
        }
        return structuredClone(customer)
      })
    },

    async createSession(session) {
      db().sessions.push(session)
    },
    async findSession(tokenHash) {
      const session = db().sessions.find((row) => row.tokenHash === tokenHash)
      return session && Date.parse(session.expiresAt) > Date.now() ? structuredClone(session) : null
    },
    async deleteSession(tokenHash) {
      const tables = db()
      tables.sessions = tables.sessions.filter((row) => row.tokenHash !== tokenHash)
    },
    async deleteSessionsFor(customerId) {
      const tables = db()
      tables.sessions = tables.sessions.filter((row) => row.customerId !== customerId)
    },

    async createReset(reset) {
      db().passwordResets.push(reset)
    },
    async consumeReset(tokenHash) {
      return transaction((tables) => {
        const reset = tables.passwordResets.find((row) => row.tokenHash === tokenHash)
        if (!reset || reset.usedAt || Date.parse(reset.expiresAt) <= Date.now()) return null
        reset.usedAt = now()
        return structuredClone(reset)
      })
    },

    async listAddresses(customerId) {
      return structuredClone(db().addresses.filter((row) => row.customerId === customerId).sort((a, b) => Number(b.isDefault) - Number(a.isDefault)))
    },
    async saveAddress(customerId, address) {
      return transaction((tables) => {
        const mine = tables.addresses.filter((row) => row.customerId === customerId)
        const isDefault = address.isDefault || mine.length === 0
        if (isDefault) for (const row of mine) row.isDefault = false
        const existing = address.id ? mine.find((row) => row.id === address.id) : undefined
        if (address.id && !existing) throw new DomainError("not_found", "Address not found.")
        const saved = { ...address, id: existing?.id ?? newId(), customerId, isDefault }
        if (existing) Object.assign(existing, saved)
        else tables.addresses.push(saved)
        return structuredClone(saved)
      })
    },
    async deleteAddress(customerId, addressId) {
      transaction((tables) => {
        const target = tables.addresses.find((row) => row.id === addressId && row.customerId === customerId)
        if (!target) throw new DomainError("not_found", "Address not found.")
        tables.addresses = tables.addresses.filter((row) => row !== target)
        const next = tables.addresses.find((row) => row.customerId === customerId)
        if (target.isDefault && next) next.isDefault = true
      })
    },

    async scrub(customerId, expectedPasswordHash) {
      transaction((tables) => {
        const customer = tables.customers.find((row) => row.id === customerId)
        if (!customer) return
        if (expectedPasswordHash !== undefined && customer.passwordHash !== expectedPasswordHash) throw new DomainError("unauthorized", "Your credentials changed. Please sign in again.")
        Object.assign(customer, {
          email: `deleted+${customer.id}@invalid`,
          passwordHash: "",
          fullName: "Deleted customer",
          phone: null,
          marketingOptIn: false,
          deletionRequestedAt: customer.deletionRequestedAt ?? now(),
        })
        tables.addresses = tables.addresses.filter((row) => row.customerId !== customerId)
        tables.sessions = tables.sessions.filter((row) => row.customerId !== customerId)
        tables.passwordResets = tables.passwordResets.filter((row) => row.customerId !== customerId)
        if (tables.customerTokens) tables.customerTokens = tables.customerTokens.filter((row) => row.identityId !== customerId)
        if (tables.oauthAccounts) tables.oauthAccounts = tables.oauthAccounts.filter((row) => row.customerId !== customerId)
        if (tables.customerSecurity) tables.customerSecurity = tables.customerSecurity.filter((row) => row.customerId !== customerId)
      })
    },
    async search(storeId, query) {
      const q = query.q?.trim().toLowerCase()
      const digits = q?.replace(/\D/g, "") ?? ""
      const found = db()
        .customers.filter((row) => row.storeId === storeId && !row.email.endsWith("@invalid"))
        .filter((row) => !q || row.email.includes(q) || row.fullName.toLowerCase().includes(q) || (digits.length >= 4 && (row.phone ?? "").replace(/\D/g, "").includes(digits)))
        .filter((row) => !query.group || row.group === query.group)
        .filter((row) => query.marketing === undefined || row.marketingOptIn === query.marketing)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const start = (query.page - 1) * query.pageSize
      return { customers: structuredClone(found.slice(start, start + query.pageSize)), total: found.length }
    },
  }
  return fixturePolicy<CustomerOperations>(operations, {
    findByEmail(actor, storeId) { requireStore(actor, storeId); requireSystem(actor, ["auth:customer", "migration"]) },
    findById(actor, id) { requireCustomerOwner(actor, id, "customers:read") },
    create(actor, customer) { requireStore(actor, customer.storeId); requireSystem(actor, ["auth:customer", "migration"]) },
    update(actor, id, changes) {
      requireCustomerOwner(actor, id, "customers:write")
      if (actor.kind === "staff" && (changes.passwordHash !== undefined || changes.email !== undefined)) throw new DomainError("forbidden", "Staff cannot change customer credentials.")
      if (actor.kind === "customer" && changes.group !== undefined) throw new DomainError("forbidden", "Price groups are managed by staff.")
      if (actor.kind === "staff" && (changes.fullName !== undefined || changes.phone !== undefined)) requireGrant(actor, "customers:read_pii")
    },
    createSession(actor, input) { requireSystem(actor, ["auth:customer", "migration"]); existingCustomer(actor, input.customerId) },
    findSession(actor) { requireSystem(actor, ["auth:customer", "migration"]) },
    deleteSession(actor) { requireSystem(actor, ["auth:customer", "migration"]) },
    deleteSessionsFor(actor, id) { requireCustomerOwner(actor, id, "customers:write") },
    createReset(actor, input) { requireSystem(actor, ["auth:customer", "migration"]); existingCustomer(actor, input.customerId) },
    consumeReset(actor) { requireSystem(actor, ["auth:customer", "migration"]) },
    listAddresses(actor, id) { requireCustomerOwner(actor, id, "customers:read") },
    saveAddress(actor, id) { requireCustomerOwner(actor, id); existingCustomer(actor, id) },
    deleteAddress(actor, id) { requireCustomerOwner(actor, id) },
    scrub(actor, id) { requireCustomerOwner(actor, id, "customers:delete"); if (actor.kind === "staff") requireFreshGrant(actor, "customers:delete") },
    search(actor, storeId) { requireStore(actor, storeId); requireGrant(actor, "customers:read") },
  }, {
    findById: (actor, row) => row ? customerProjection(actor, row) : null,
    update: customerProjection,
    search: (actor, page) => ({ ...page, customers: page.customers.map((row) => customerProjection(actor, row)) }),
    listAddresses: (actor, rows) => actor.kind !== "staff" || actor.permissions.includes("customers:read_pii") ? rows : rows.map((row) => ({ ...row, fullName: row.fullName.split(" ")[0], phone: row.phone ? "•••" + row.phone.replace(/\D/g, "").slice(-3) : "", line1: "•••", line2: row.line2 ? "•••" : undefined, postalCode: row.postalCode ? "•••" : undefined })),
  })
}
