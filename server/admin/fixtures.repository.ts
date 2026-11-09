import "server-only"
import { fixturePolicy } from "@/server/db/fixtures-policy.repository"
import { adminGuards, adminProjections } from "@/server/db/fixture-private-guards.repository"
import { currentActor } from "@/server/db/context"

import { OWNER_ROLE_KEY, isPermission } from "@/server/admin/permissions"
import type { AdminOperations, AdminRepository } from "@/server/admin/repository"
import type { Role } from "@/server/admin/types"
import { db, transaction } from "@/server/fixtures/store"
import type { FixtureTables } from "@/server/fixtures/tables"
import { DomainError } from "@/server/shared/errors"
import { newId, now } from "@/server/shared/ids"

const LAST_OWNER = "The store must keep at least one active Owner."

/** Active members holding the Owner role (the last-Owner invariant, A-008). */
function activeOwners(tables: FixtureTables, storeId: string): number {
  const owner = tables.adminRoles.find((role) => role.storeId === storeId && role.key === OWNER_ROLE_KEY)
  if (!owner) return 0
  return tables.staffMembers.filter(
    (member) =>
      member.storeId === storeId &&
      member.status === "active" &&
      tables.staffRoleLinks.some((link) => link.storeId === storeId && link.userId === member.userId && link.roleId === owner.id),
  ).length
}

/** Runs `change`, then refuses it if it removed the last active Owner of a store that had one. */
function keepingAnOwner<T>(tables: FixtureTables, storeId: string, change: () => T): T {
  const before = activeOwners(tables, storeId)
  const result = change()
  if (before > 0 && activeOwners(tables, storeId) === 0) throw new DomainError("conflict", LAST_OWNER)
  return result
}

export function createFixturesAdminRepository(clock: () => number = Date.now): AdminRepository {
  const operations: AdminOperations = {
    async findMemberByEmail(storeId, email) {
      return structuredClone(db().staffMembers.find((row) => row.storeId === storeId && row.email === email.toLowerCase()) ?? null)
    },
    async emailInUse(storeId, email) {
      return db().staffMembers.some((row) => row.storeId === storeId && row.email === email.trim().toLowerCase())
    },
    async findMember(storeId, userId) {
      return structuredClone(db().staffMembers.find((row) => row.storeId === storeId && row.userId === userId) ?? null)
    },
    async listMembers(storeId) {
      return structuredClone(db().staffMembers.filter((row) => row.storeId === storeId))
    },
    async createMember(member) {
      return transaction((tables) => {
        if (tables.staffMembers.some((row) => row.storeId === member.storeId && row.email === member.email)) {
          throw new DomainError("conflict", "A staff member with this email already exists.")
        }
        tables.staffMembers.push(structuredClone(member))
        return structuredClone(member)
      })
    },
    async updateMember(storeId, userId, changes, expectedUpdatedAt) {
      return transaction((tables) =>
        keepingAnOwner(tables, storeId, () => {
          const member = tables.staffMembers.find((row) => row.storeId === storeId && row.userId === userId)
          if (!member) throw new DomainError("not_found", "Staff member not found.")
          if (expectedUpdatedAt && member.updatedAt !== expectedUpdatedAt) throw new DomainError("conflict", "Someone else changed this staff member. Reload to see their changes.")
          if (changes.totpLastStep !== undefined && changes.totpLastStep !== null && member.totpLastStep !== null && changes.totpLastStep <= member.totpLastStep) throw new DomainError("unauthorized", "That code was already used. Wait for a new code.")
          if (changes.recoveryCodes !== undefined && member.totpEnabledAt && changes.totpEnabledAt === undefined) {
            const actor = currentActor()
            if (actor.kind === "system" && actor.purpose === "auth:staff" && (changes.recoveryCodes.length !== member.recoveryCodes.length - 1 || changes.recoveryCodes.some((value) => !member.recoveryCodes.includes(value)))) throw new DomainError("unauthorized", "That recovery code was already used.")
            if (actor.kind === "staff" && (!actor.mfaVerifiedAt || Date.parse(actor.mfaVerifiedAt) + 600_000 < Date.now())) throw new DomainError("forbidden", "Confirm it's you with your authenticator code to continue.", { stepUp: true })
          }
          if (changes.status === "suspended" || changes.passwordHash !== undefined || changes.email !== undefined || member.totpEnabledAt && changes.totpEnabledAt === null) {
            for (const session of tables.staffSessions) if (session.storeId === storeId && session.userId === userId && !session.revokedAt) session.revokedAt = now()
          }
          Object.assign(member, structuredClone(changes), { updatedAt: new Date(Math.max(Date.now(), Date.parse(member.updatedAt) + 1)).toISOString() })
          return structuredClone(member)
        }),
      )
    },

    async syncRegistry(storeId, permissions, presets) {
      transaction((tables) => {
        tables.adminPermissions = structuredClone(permissions)
        for (const preset of presets) {
          const existing = tables.adminRoles.find((role) => role.storeId === storeId && role.key === preset.key)
          const values = { name: preset.name, description: preset.description, refundLimit: preset.refundLimit, permissions: [...preset.permissions], isSystem: true }
          if (existing) Object.assign(existing, values, { updatedAt: now() })
          else tables.adminRoles.push({ id: newId(), storeId, key: preset.key, ...values, createdAt: now(), updatedAt: now() })
        }
      })
    },
    async listRoles(storeId) {
      return structuredClone(db().adminRoles.filter((role) => role.storeId === storeId))
    },
    async findRole(storeId, key) {
      return structuredClone(db().adminRoles.find((role) => role.storeId === storeId && role.key === key) ?? null)
    },
    async createRole(role) {
      return transaction((tables) => {
        if (tables.adminRoles.some((row) => row.storeId === role.storeId && row.key === role.key)) throw new DomainError("conflict", "A role with this name already exists.")
        tables.adminRoles.push(structuredClone(role))
        return structuredClone(role)
      })
    },
    async updateRole(storeId, key, changes, expectedUpdatedAt) {
      return transaction((tables) => {
        const role = tables.adminRoles.find((row) => row.storeId === storeId && row.key === key)
        if (!role) throw new DomainError("not_found", "Role not found.")
        if (expectedUpdatedAt && role.updatedAt !== expectedUpdatedAt) throw new DomainError("conflict", "Someone else changed this role. Reload to see their changes.")
        Object.assign(role, structuredClone(changes), { updatedAt: new Date(Math.max(Date.now(), Date.parse(role.updatedAt) + 1)).toISOString() })
        const members = new Set(tables.staffRoleLinks.filter((link) => link.storeId === storeId && link.roleId === role.id).map((link) => link.userId))
        for (const session of tables.staffSessions) if (session.storeId === storeId && members.has(session.userId) && !session.revokedAt) session.revokedAt = now()
        return structuredClone(role)
      })
    },
    async deleteRole(storeId, key) {
      transaction((tables) => {
        const role = tables.adminRoles.find((row) => row.storeId === storeId && row.key === key)
        if (!role) throw new DomainError("not_found", "Role not found.")
        if (tables.staffRoleLinks.some((link) => link.roleId === role.id)) throw new DomainError("conflict", "Staff members still have this role. Change their roles first.")
        tables.adminRoles = tables.adminRoles.filter((row) => row !== role)
      })
    },

    async rolesOf(storeId, userId) {
      const tables = db()
      const ids = new Set(tables.staffRoleLinks.filter((link) => link.storeId === storeId && link.userId === userId).map((link) => link.roleId))
      return structuredClone(tables.adminRoles.filter((role): role is Role => ids.has(role.id)).map((role) => ({ ...role, permissions: role.permissions.filter(isPermission) })))
    },
    async listRoleAssignments(storeId) {
      const tables = db(), order = new Map(tables.adminRoles.map((role, index) => [role.id, index]))
      return structuredClone(tables.staffRoleLinks.filter((link) => link.storeId === storeId).sort((a, b) => (order.get(a.roleId) ?? 0) - (order.get(b.roleId) ?? 0)).map(({ userId, roleId }) => ({ userId, roleId })))
    },
    async setRoles(storeId, userId, roleKeys) {
      transaction((tables) =>
        keepingAnOwner(tables, storeId, () => {
          const roles = roleKeys.map((key) => {
            const role = tables.adminRoles.find((row) => row.storeId === storeId && row.key === key)
            if (!role) throw new DomainError("validation", `Unknown role: ${key}`)
            return role
          })
          tables.staffRoleLinks = [
            ...tables.staffRoleLinks.filter((link) => !(link.storeId === storeId && link.userId === userId)),
            ...roles.map((role) => ({ storeId, userId, roleId: role.id })),
          ]
          for (const session of tables.staffSessions) if (session.storeId === storeId && session.userId === userId && !session.revokedAt) session.revokedAt = now()
        }),
      )
    },
    async countActiveOwners(storeId) {
      return activeOwners(db(), storeId)
    },

    async createInvite(invite) {
      db().staffInvites.push(structuredClone(invite))
      return structuredClone(invite)
    },
    async findInviteByTokenHash(tokenHash) {
      return structuredClone(db().staffInvites.find((row) => row.tokenHash === tokenHash) ?? null)
    },
    async updateInvite(id, changes) {
      const invite = db().staffInvites.find((row) => row.id === id)
      if (changes.acceptedAt && (!invite || invite.acceptedAt || invite.revokedAt || Date.parse(invite.expiresAt) <= clock())) throw new DomainError("conflict", "This invite was already used.")
      if (invite) Object.assign(invite, structuredClone(changes))
    },
    async listInvites(storeId) {
      return structuredClone(db().staffInvites.filter((row) => row.storeId === storeId))
    },

    async createSession(session) {
      const owner = db().staffMembers.find((row) => row.userId === session.userId && row.storeId === session.storeId && row.status === "active")
      if (!owner || session.aal === 2 && (!session.mfaAt || !owner.totpEnabledAt) || session.aal === 1 && session.mfaAt !== null) throw new DomainError("unauthorized", "Finish two-step verification first.")
      db().staffSessions.push(structuredClone(session))
    },
    async findSessionByTokenHash(tokenHash) {
      return structuredClone(db().staffSessions.find((row) => row.tokenHash === tokenHash) ?? null)
    },
    async updateSession(id, changes) {
      const session = db().staffSessions.find((row) => row.id === id)
      if (session) Object.assign(session, structuredClone(changes))
    },
    async listSessions(storeId, userId) {
      return structuredClone(db().staffSessions.filter((row) => row.storeId === storeId && row.userId === userId))
    },
    async revokeSessions(storeId, userId, keepSessionId) {
      const at = now()
      for (const session of db().staffSessions) {
        if (session.storeId === storeId && session.userId === userId && session.id !== keepSessionId && !session.revokedAt) session.revokedAt = at
      }
    },
  }
  return fixturePolicy<AdminOperations>(operations, adminGuards, adminProjections)
}
