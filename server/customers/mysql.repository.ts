import "server-only"

import { and, count, desc, eq, getTableColumns, gt, isNull, like, notLike, or } from "drizzle-orm"
import type { CustomerRepository } from "./repository"
import type { Customer, CustomerAddress, PasswordReset, Session } from "./types"
import { type Actor, type ActorScoped, requireCustomerOwner, requireFreshGrant, requireGrant, requireStore, requireSystem } from "@/server/db/actor"
import { database, withTransaction } from "@/server/db/client"
import { constant, maskedEmail, maskedPhone } from "@/server/db/query.repository"
import { addresses, customers, passwordResets, sessions } from "@/server/db/schema"
import { escapeLike, isoDate, nullableIsoDate, sqlDate, sqlNow } from "@/server/db/values"
import { uuidv7 } from "@/server/db/uuid"
import { DomainError } from "@/server/shared/errors"

function projection(actor: Actor) {
  const own = actor.kind === "customer" || actor.kind === "system" && ["auth:customer", "migration"].includes(actor.purpose)
  const pii = own || actor.permissions.includes("customers:read_pii")
  return { ...getTableColumns(customers), email: pii ? customers.email : maskedEmail(customers.email), phone: pii ? customers.phone : maskedPhone(customers.phone), passwordHash: own ? customers.passwordHash : constant("") }
}

function customer(row: typeof customers.$inferSelect): Customer {
  return { id: row.id, storeId: row.storeId, email: row.email, passwordHash: row.passwordHash, fullName: row.fullName, phone: row.phone, group: row.customerGroup as Customer["group"], marketingOptIn: row.marketingOptIn === 1, createdAt: isoDate(row.createdAt), deletionRequestedAt: nullableIsoDate(row.deletionRequestedAt) }
}

function address(row: typeof addresses.$inferSelect): CustomerAddress {
  return { ...row, line2: row.line2 ?? undefined, postalCode: row.postalCode ?? undefined, isDefault: row.isDefault === 1 }
}

export function createMysqlCustomerRepository(): ActorScoped<CustomerRepository> {
  return {
    async findByEmail(actor, storeId, email) {
      requireStore(actor, storeId); requireSystem(actor, ["auth:customer", "migration"])
      const db = await database()
      const [row] = await db.select(projection(actor)).from(customers).where(and(eq(customers.storeId, actor.storeId), eq(customers.email, email.trim().toLowerCase()))).limit(1)
      return row ? customer(row) : null
    },
    async findById(actor, id) {
      requireCustomerOwner(actor, id, "customers:read")
      const db = await database()
      const [row] = await db.select(projection(actor)).from(customers).where(and(eq(customers.storeId, actor.storeId), eq(customers.id, id))).limit(1)
      return row ? customer(row) : null
    },
    async create(actor, input) {
      requireStore(actor, input.storeId); requireSystem(actor, ["auth:customer", "migration"])
      const db = await database()
      const { group, marketingOptIn, createdAt, deletionRequestedAt, ...rest } = input
      const values = { ...rest, email: input.email.trim().toLowerCase(), customerGroup: group, marketingOptIn: marketingOptIn ? 1 : 0, createdAt: sqlDate(createdAt), deletionRequestedAt: deletionRequestedAt ? sqlDate(deletionRequestedAt) : null }
      await db.insert(customers).values(values)
      return customer({ ...values, phone: input.phone })
    },
    async update(actor, id, changes) {
      requireCustomerOwner(actor, id, "customers:write")
      if (actor.kind === "staff" && (changes.passwordHash !== undefined || changes.email !== undefined)) throw new DomainError("forbidden", "Staff cannot change customer credentials.")
      if (actor.kind === "customer" && changes.group !== undefined) throw new DomainError("forbidden", "Price groups are managed by staff.")
      if (actor.kind === "staff" && (changes.fullName !== undefined || changes.phone !== undefined)) requireGrant(actor, "customers:read_pii")
      return withTransaction(async (db) => {
        const where = and(eq(customers.storeId, actor.storeId), eq(customers.id, id))
        const [row] = await db.select({ id: customers.id }).from(customers).where(where).for("update")
        if (!row) throw new DomainError("not_found", "Account not found.")
        const { group, marketingOptIn, ...rest } = changes
        await db.update(customers).set({ ...rest, ...(changes.email !== undefined ? { email: changes.email.trim().toLowerCase() } : {}), ...(group !== undefined ? { customerGroup: group } : {}), ...(marketingOptIn !== undefined ? { marketingOptIn: marketingOptIn ? 1 : 0 } : {}) }).where(where)
        return customer((await db.select(projection(actor)).from(customers).where(where))[0])
      })
    },
    async createSession(actor, input) {
      requireSystem(actor, ["auth:customer", "migration"])
      await withTransaction(async (db) => {
        const [owner] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, input.customerId), eq(customers.storeId, actor.storeId))).for("update")
        if (!owner) throw new DomainError("not_found", "Account not found.")
        await db.insert(sessions).values({ ...input, createdAt: sqlDate(input.createdAt), expiresAt: sqlDate(input.expiresAt) })
      })
    },
    async findSession(actor, tokenHash) {
      requireSystem(actor, ["auth:customer", "migration"])
      const db = await database()
      const [row] = await db.select(getTableColumns(sessions)).from(sessions).innerJoin(customers, eq(customers.id, sessions.customerId)).where(and(eq(customers.storeId, actor.storeId), eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, sqlNow()))).limit(1)
      return row ? { ...row, createdAt: isoDate(row.createdAt), expiresAt: isoDate(row.expiresAt) } satisfies Session : null
    },
    async deleteSession(actor, tokenHash) {
      requireSystem(actor, ["auth:customer", "migration"])
      await withTransaction(async (db) => {
        const [row] = await db.select({ hash: sessions.tokenHash }).from(sessions).innerJoin(customers, eq(customers.id, sessions.customerId)).where(and(eq(customers.storeId, actor.storeId), eq(sessions.tokenHash, tokenHash))).for("update")
        if (row) await db.delete(sessions).where(eq(sessions.tokenHash, row.hash))
      })
    },
    async deleteSessionsFor(actor, customerId) {
      requireCustomerOwner(actor, customerId, "customers:write")
      await withTransaction(async (db) => {
        const [owner] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, customerId), eq(customers.storeId, actor.storeId))).for("update")
        if (owner) await db.delete(sessions).where(eq(sessions.customerId, owner.id))
      })
    },
    async createReset(actor, input) {
      requireSystem(actor, ["auth:customer", "migration"])
      await withTransaction(async (db) => {
        const [owner] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, input.customerId), eq(customers.storeId, actor.storeId))).for("update")
        if (!owner) throw new DomainError("not_found", "Account not found.")
        await db.insert(passwordResets).values({ ...input, expiresAt: sqlDate(input.expiresAt), usedAt: input.usedAt ? sqlDate(input.usedAt) : null })
      })
    },
    async consumeReset(actor, tokenHash) {
      requireSystem(actor, ["auth:customer", "migration"])
      return withTransaction(async (db) => {
        const [row] = await db.select(getTableColumns(passwordResets)).from(passwordResets).innerJoin(customers, eq(customers.id, passwordResets.customerId)).where(and(eq(customers.storeId, actor.storeId), eq(passwordResets.tokenHash, tokenHash), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, sqlNow()))).for("update")
        if (!row) return null
        const usedAt = new Date().toISOString()
        await db.update(passwordResets).set({ usedAt: sqlDate(usedAt) }).where(and(eq(passwordResets.tokenHash, tokenHash), eq(passwordResets.customerId, row.customerId), isNull(passwordResets.usedAt)))
        return { ...row, expiresAt: isoDate(row.expiresAt), usedAt } satisfies PasswordReset
      })
    },
    async listAddresses(actor, customerId) {
      requireCustomerOwner(actor, customerId, "customers:read")
      if (actor.kind === "staff" && !actor.permissions.includes("customers:read_pii")) return []
      const db = await database()
      const rows = await db.select(getTableColumns(addresses)).from(addresses).innerJoin(customers, eq(customers.id, addresses.customerId)).where(and(eq(customers.storeId, actor.storeId), eq(addresses.customerId, customerId))).orderBy(desc(addresses.isDefault), addresses.id)
      return rows.map(address)
    },
    async saveAddress(actor, customerId, input) {
      requireCustomerOwner(actor, customerId)
      return withTransaction(async (db) => {
        const [owner] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, customerId), eq(customers.storeId, actor.storeId))).for("update")
        if (!owner) throw new DomainError("not_found", "Account not found.")
        const rows = await db.select().from(addresses).where(eq(addresses.customerId, owner.id)).orderBy(addresses.id).for("update")
        const current = input.id ? rows.find((row) => row.id === input.id) : null
        if (input.id && !current) throw new DomainError("not_found", "Address not found.")
        const isDefault = input.isDefault || rows.length === 0
        if (isDefault) await db.update(addresses).set({ isDefault: 0 }).where(eq(addresses.customerId, owner.id))
        const values = { ...input, line2: input.line2 ?? null, postalCode: input.postalCode ?? null, isDefault: isDefault ? 1 : 0 }
        const id = current?.id ?? uuidv7()
        if (current) await db.update(addresses).set(values).where(and(eq(addresses.id, id), eq(addresses.customerId, owner.id)))
        else await db.insert(addresses).values({ ...values, id, customerId: owner.id })
        return address((await db.select().from(addresses).where(and(eq(addresses.id, id), eq(addresses.customerId, owner.id))))[0])
      })
    },
    async deleteAddress(actor, customerId, addressId) {
      requireCustomerOwner(actor, customerId)
      await withTransaction(async (db) => {
        const [owner] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, customerId), eq(customers.storeId, actor.storeId))).for("update")
        if (!owner) throw new DomainError("not_found", "Address not found.")
        const rows = await db.select().from(addresses).where(eq(addresses.customerId, owner.id)).orderBy(addresses.id).for("update")
        const target = rows.find((row) => row.id === addressId)
        if (!target) throw new DomainError("not_found", "Address not found.")
        await db.delete(addresses).where(and(eq(addresses.customerId, owner.id), eq(addresses.id, addressId)))
        const next = rows.find((row) => row.id !== addressId)
        if (target.isDefault && next) await db.update(addresses).set({ isDefault: 1 }).where(and(eq(addresses.customerId, owner.id), eq(addresses.id, next.id)))
      })
    },
    async scrub(actor, customerId) {
      requireCustomerOwner(actor, customerId, "customers:delete")
      if (actor.kind === "staff") requireFreshGrant(actor, "customers:delete")
      await withTransaction(async (db) => {
        const where = and(eq(customers.id, customerId), eq(customers.storeId, actor.storeId))
        const [row] = await db.select({ id: customers.id, deletionRequestedAt: customers.deletionRequestedAt }).from(customers).where(where).for("update")
        if (!row) return
        await db.update(customers).set({ email: "deleted+" + row.id + "@invalid", passwordHash: "", fullName: "Deleted customer", phone: null, marketingOptIn: 0, deletionRequestedAt: row.deletionRequestedAt ?? sqlNow() }).where(where)
        await db.delete(addresses).where(eq(addresses.customerId, row.id))
        await db.delete(sessions).where(eq(sessions.customerId, row.id))
        await db.delete(passwordResets).where(eq(passwordResets.customerId, row.id))
      })
    },
    async search(actor, storeId, query) {
      requireStore(actor, storeId); requireGrant(actor, "customers:read")
      const db = await database()
      const term = query.q?.trim() ? "%" + escapeLike(query.q.trim()) + "%" : null
      const where = and(eq(customers.storeId, actor.storeId), notLike(customers.email, "%@invalid"), query.group ? eq(customers.customerGroup, query.group) : undefined, query.marketing !== undefined ? eq(customers.marketingOptIn, query.marketing ? 1 : 0) : undefined, term ? or(like(customers.email, term), like(customers.fullName, term), like(customers.phone, term)) : undefined)
      const [rows, [total]] = await Promise.all([db.select(projection(actor)).from(customers).where(where).orderBy(desc(customers.createdAt), customers.id).limit(query.pageSize).offset((query.page - 1) * query.pageSize), db.select({ count: count() }).from(customers).where(where)])
      return { customers: rows.map(customer), total: total.count }
    },
  }
}
