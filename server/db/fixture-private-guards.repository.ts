import "server-only"

import { type Actor, requireCustomerOwner, requireFreshGrant, requireGrant, requireStore, requireSystem } from "./actor"
import type { FixtureGuards, FixtureProjections } from "./fixtures-policy.repository"
import { actionLabel, fixtureCartOwner, jobGrant } from "./fixture-guards.repository"
import type { AdminOperations } from "@/server/admin/repository"
import type { OrderOperations } from "@/server/orders/repository"
import type { PlatformOperations } from "@/server/platform/repository"
import type { Order } from "@/server/orders/types"
import type { Permission } from "@/server/admin/permissions"
import { db } from "@/server/fixtures/store"
import { DomainError } from "@/server/shared/errors"

const auth = (actor: Actor) => actor.kind === "system" && ["auth:staff", "bootstrap", "migration"].includes(actor.purpose)
const store = (actor: Actor, storeId: string) => requireStore(actor, storeId)
const memberRead = (actor: Actor, storeId: string, userId?: string) => { store(actor, storeId); if (!auth(actor) && !(actor.kind === "staff" && actor.id === userId)) requireGrant(actor, "staff:read") }
const manage = (actor: Actor, permission: "staff:manage" | "roles:manage" = "staff:manage") => { if (!auth(actor)) requireFreshGrant(actor, permission) }
function canGrant(actor: Actor, permissions: readonly Permission[], keys: readonly string[] = []) {
  if (auth(actor)) return
  if (actor.kind !== "staff" || permissions.some((permission) => !actor.permissions.includes(permission)) || keys.includes("owner") && !actor.roleKeys.includes("owner")) throw new DomainError("forbidden", "You can't grant permissions you don't have yourself.")
}
const targetOwner = (id: string) => db().staffRoleLinks.some((link) => link.userId === id && db().adminRoles.some((role) => role.id === link.roleId && role.key === "owner"))
export const adminGuards: FixtureGuards<AdminOperations> = {
  findMemberByEmail(actor, storeId) { store(actor, storeId); requireSystem(actor, ["auth:staff", "bootstrap", "migration"]) },
  findMember: memberRead, listMembers: memberRead,
  createMember(actor, member) { store(actor, member.storeId); manage(actor) },
  updateMember(actor, storeId, userId, changes) {
    store(actor, storeId)
    if (!(actor.kind === "staff" && actor.id === userId) || changes.status !== undefined) manage(actor)
    if (changes.userId !== undefined || changes.storeId !== undefined) throw new DomainError("validation", "Identity keys cannot be changed.")
    if (!auth(actor) && actor.kind === "staff" && actor.id !== userId) {
      if (changes.passwordHash !== undefined || changes.email !== undefined) throw new DomainError("forbidden", "Staff cannot replace another member's credentials.")
      if (targetOwner(userId) && (changes.status !== undefined || changes.totpSecret !== undefined || changes.totpEnabledAt !== undefined || changes.recoveryCodes !== undefined)) canGrant(actor, [], ["owner"])
    }
  },
  syncRegistry(actor, storeId) { store(actor, storeId); requireSystem(actor, ["auth:staff", "bootstrap", "migration"]) },
  listRoles: memberRead, findRole: memberRead,
  createRole(actor, role) { store(actor, role.storeId); manage(actor, "roles:manage"); canGrant(actor, role.permissions, [role.key]); if (role.isSystem) throw new DomainError("forbidden", "System roles are managed by the registry.") },
  updateRole(actor, storeId, key, changes) { store(actor, storeId); manage(actor, "roles:manage"); canGrant(actor, changes.permissions ?? []); if (key === "owner") throw new DomainError("forbidden", "The Owner role cannot be edited.") },
  deleteRole(actor, storeId, key) { store(actor, storeId); manage(actor, "roles:manage"); if (db().adminRoles.find((row) => row.storeId === storeId && row.key === key)?.isSystem) throw new DomainError("forbidden", "System roles cannot be deleted.") },
  rolesOf: memberRead,
  setRoles(actor, storeId, userId, keys) { store(actor, storeId); manage(actor); const selected = db().adminRoles.filter((role) => keys.includes(role.key)); canGrant(actor, selected.flatMap((role) => role.permissions), keys); if (targetOwner(userId) && !keys.includes("owner")) canGrant(actor, [], ["owner"]) },
  countActiveOwners: memberRead,
  createInvite(actor, invite) { store(actor, invite.storeId); manage(actor); const role = db().adminRoles.find((row) => row.key === invite.roleKey); if (!role) throw new DomainError("validation", "Unknown role."); canGrant(actor, role.permissions, [role.key]) },
  findInviteByTokenHash(actor) { requireSystem(actor, ["auth:staff", "bootstrap", "migration"]) },
  updateInvite(actor, _id, changes) { manage(actor); if (changes.id !== undefined || changes.storeId !== undefined || changes.tokenHash !== undefined || changes.email !== undefined || changes.roleKey !== undefined || changes.invitedBy !== undefined) throw new DomainError("validation", "Invite identity cannot be changed."); if (!auth(actor) && changes.acceptedAt !== undefined) throw new DomainError("forbidden", "Only invite acceptance can consume an invite.") },
  listInvites: memberRead,
  createSession(actor, session) { store(actor, session.storeId); requireSystem(actor, ["auth:staff", "bootstrap", "migration"]) },
  findSessionByTokenHash(actor) { requireSystem(actor, ["auth:staff", "bootstrap", "migration"]) },
  updateSession(actor, _id, changes) { requireSystem(actor, ["auth:staff", "bootstrap", "migration"]); if (changes.id !== undefined || changes.userId !== undefined || changes.storeId !== undefined || changes.tokenHash !== undefined) throw new DomainError("validation", "Session identity cannot be changed.") },
  listSessions: memberRead,
  revokeSessions(actor, storeId, userId) { store(actor, storeId); if (!(actor.kind === "staff" && actor.id === userId)) manage(actor) },
}
const projectMember = (actor: Actor, row: Awaited<ReturnType<AdminOperations["findMember"]>>) => !row || auth(actor) || actor.kind === "staff" && actor.id === row.userId ? row : { ...row, passwordHash: null, totpSecret: null, recoveryCodes: [] }
export const adminProjections: FixtureProjections<AdminOperations> = { findMember: projectMember, listMembers: (actor, rows) => rows.map((row) => projectMember(actor, row)!) }

export function orderReader(actor: Actor, permission: "orders:read" | "customers:read" = "orders:read") {
  if (actor.kind === "staff" || actor.kind === "system") { requireGrant(actor, permission); return }
  if (actor.kind === "customer" || actor.orderAccessTokenHash || actor.cartTokenHash || actor.orderLookup) return
  throw new DomainError("forbidden", "You don't have access to this order.")
}
function visible(actor: Actor, order: Order): boolean {
  if (order.storeId !== actor.storeId) return false
  if (actor.kind === "staff" || actor.kind === "system") return true
  if (actor.kind === "customer" && order.customerId === actor.id || actor.orderAccessTokenHash === order.accessTokenHash) return true
  if (actor.orderLookup && actor.orderLookup.number === order.number && actor.orderLookup.email.trim().toLowerCase() === order.email) return true
  const cartId = db().orderCarts?.get(order.id)
  return !!cartId && db().carts.some((cart) => cart.id === cartId && cart.tokenHash === actor.cartTokenHash && (!cart.customerId || actor.kind === "customer" && cart.customerId === actor.id))
}
function ownedOrder(actor: Actor, id: string) { orderReader(actor); const order = db().orders.find((row) => row.id === id && visible(actor, row)); if (!order) throw new DomainError("not_found", "Order not found."); return order }
const transitionPermissions = { pending_payment: "orders:write", confirmed: "orders:mark_paid", processing: "orders:fulfil", shipped: "orders:fulfil", delivered: "orders:fulfil", cancelled: "orders:cancel", returned: "orders:returns" } as const
export const orderGuards: FixtureGuards<OrderOperations> = {
  placeOrder(actor, input) { store(actor, input.draft.storeId); fixtureCartOwner(actor, input.cartId); if (actor.kind === "customer" && input.draft.customerId !== actor.id || actor.kind === "anonymous" && input.draft.customerId !== null) throw new DomainError("forbidden", "Order identity does not match the shopper.") },
  findByNumber(actor, storeId) { store(actor, storeId); orderReader(actor) }, findById(actor) { orderReader(actor) },
  findByIdempotencyKey(actor, storeId) { store(actor, storeId); orderReader(actor) },
  listByCustomer(actor, storeId, customerId) { store(actor, storeId); requireCustomerOwner(actor, customerId, actor.permissions.includes("orders:read") ? "orders:read" : "customers:read") },
  listByEmail(actor, storeId) { store(actor, storeId); orderReader(actor) },
  transition(actor, id, status, label) { if (actor.kind === "staff" || actor.kind === "system") requireGrant(actor, transitionPermissions[status]); else if (status !== "cancelled") throw new DomainError("forbidden", "You don't have permission to change this order."); actionLabel(actor, label); ownedOrder(actor, id) },
  recordPayment(actor, input) { requireGrant(actor, "orders:mark_paid"); ownedOrder(actor, input.orderId) },
  listPayments(actor, id) { ownedOrder(actor, id) }, listRefunds(actor, id) { ownedOrder(actor, id) }, listReturns(actor, id) { ownedOrder(actor, id) },
  createRefund(actor, input) { requireFreshGrant(actor, "orders:refund"); if (actor.kind === "staff" && actor.refundLimit !== null && input.amount > actor.refundLimit) throw new DomainError("forbidden", "This refund exceeds your role's limit."); ownedOrder(actor, input.orderId) },
  createReturn(actor, input) { if (actor.kind === "staff" || actor.kind === "system") requireGrant(actor, "orders:returns"); ownedOrder(actor, input.orderId) },
  restockReturn(actor, _id, label) { requireGrant(actor, "orders:returns"); actionLabel(actor, label) }, decideReturn(actor, _id, _decision, label) { requireGrant(actor, "orders:returns"); actionLabel(actor, label) },
  nextOrderNumber(actor, storeId) { store(actor, storeId); requireGrant(actor, "orders:write") }, search(actor, storeId) { store(actor, storeId); requireGrant(actor, "orders:read") },
  addNote(actor, note) { requireGrant(actor, "orders:write"); if (actor.kind === "staff" && note.author !== actor.id) throw new DomainError("forbidden", "Note author does not match the actor."); ownedOrder(actor, note.orderId) },
  listNotes(actor, id) { requireGrant(actor, "orders:read"); ownedOrder(actor, id) }, ledger(actor, storeId) { store(actor, storeId); requireGrant(actor, "payments:read") },
  anonymiseCustomer(actor, customerId) { requireCustomerOwner(actor, customerId, "customers:delete"); if (actor.kind === "staff") requireFreshGrant(actor, "customers:delete") },
}
function projectOrder(actor: Actor, order: Order): Order {
  if (actor.kind !== "staff") return order
  const privateFields = { accessTokenHash: "", idempotencyKey: "" }
  if (actor.permissions.includes("customers:read_pii")) return { ...order, ...privateFields }
  const address = order.shippingAddress
  return { ...order, ...privateFields, email: order.email.slice(0, 1) + "•••@" + order.email.split("@").at(-1), phone: order.phone ? "•••" + order.phone.replace(/\D/g, "").slice(-3) : "", shippingAddress: { ...address, fullName: address.fullName.split(" ")[0], phone: address.phone ? "•••" + address.phone.replace(/\D/g, "").slice(-3) : "", line1: "•••", line2: address.line2 ? "•••" : undefined, postalCode: address.postalCode ? "•••" : undefined } }
}
const oneOrder = (actor: Actor, order: Order | null) => order && visible(actor, order) ? projectOrder(actor, order) : null
export const orderProjections: FixtureProjections<OrderOperations> = {
  findById: oneOrder, findByNumber: oneOrder, findByIdempotencyKey: oneOrder,
  listByCustomer: (actor, rows) => rows.map((row) => projectOrder(actor, row)), listByEmail: (actor, rows) => rows.filter((row) => visible(actor, row)).map((row) => projectOrder(actor, row)),
  search: (actor, page) => ({ ...page, orders: page.orders.map((row) => projectOrder(actor, row)) }),
  placeOrder(actor, result, input) { (db().orderCarts ??= new Map()).set(result.order.id, input.cartId); return { ...result, order: projectOrder(actor, result.order) } },
  transition: projectOrder,
}

export const platformGuards: FixtureGuards<PlatformOperations> = {
  listFlags: store,
  enqueue(actor, storeId, topic) { store(actor, storeId); if (actor.kind === "anonymous" && !["contact.received", "newsletter.subscribed"].includes(topic) && !actor.cartTokenHash) throw new DomainError("forbidden", "A verified capability is required.") },
  claimDue: jobGrant, markDelivered: jobGrant, markFailed: jobGrant, recordDelivery: jobGrant,
  claimDelivery: jobGrant, finishDelivery: jobGrant, deferEvent: jobGrant, cleanup: jobGrant,
  audit(actor, entry) { if (entry.storeId) store(actor, entry.storeId); if (actor.kind !== "system" && (actor.kind !== "staff" || entry.actor !== actor.id)) throw new DomainError("forbidden", "Audit identity does not match the actor.") },
  listAudit(actor, entity) { const grants: Record<string, Permission> = { order: "orders:read", product: "products:read", customer: "customers:read", promotion: "promotions:read" }; requireGrant(actor, actor.permissions.includes("audit:read") ? "audit:read" : grants[entity] ?? "audit:read") },
  hit(actor) { requireStore(actor, actor.storeId) }, getIdempotent(actor) { if (actor.kind === "anonymous" && !actor.cartTokenHash && !actor.orderAccessTokenHash) throw new DomainError("forbidden", "A session or cart capability is required.") },
  saveIdempotent(actor) { if (actor.kind === "anonymous" && !actor.cartTokenHash && !actor.orderAccessTokenHash) throw new DomainError("forbidden", "A session or cart capability is required.") },
  ping(actor) { requireStore(actor, actor.storeId) }, setFlag(actor, storeId) { store(actor, storeId); requireGrant(actor, "settings:flags") }, searchAudit(actor, storeId) { store(actor, storeId); requireGrant(actor, "audit:read") },
  outboxSummary(actor, storeId) { store(actor, storeId); requireGrant(actor, actor.permissions.includes("settings:read") ? "settings:read" : "dashboard:read") }, retryEvent(actor, storeId) { store(actor, storeId); requireGrant(actor, "jobs:run") },
}
const redactAudit = (actor: Actor, row: Awaited<ReturnType<PlatformOperations["listAudit"]>>[number]) => actor.permissions.includes("customers:read_pii") ? row : { ...row, before: null, after: null }
export const platformProjections: FixtureProjections<PlatformOperations> = {
  listAudit: (actor, rows) => rows.map((row) => redactAudit(actor, row)), searchAudit: (actor, page) => ({ ...page, entries: page.entries.map((row) => redactAudit(actor, row)) }),
  outboxSummary: (actor, summary) => ({ ...summary, recentFailed: summary.recentFailed.map((row) => actor.permissions.includes("customers:read_pii") ? row : { ...row, payload: {}, lastError: row.lastError ? "Delivery failed. See restricted server logs." : null }), deliveries: summary.deliveries.map((row) => ({ ...row, endpoint: actor.permissions.includes("settings:webhooks") ? row.endpoint : "•••" })) }),
}
