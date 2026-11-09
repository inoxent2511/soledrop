import type { ActorScoped } from "@/server/db/actor"
import type { PresetRole } from "@/server/admin/permissions"
import type { Role, StaffInvite, StaffMember, StaffSession } from "@/server/admin/types"

/** Staff identity and RBAC storage; both retained drivers require explicit actors. */
export interface AdminOperations {
  findMemberByEmail(storeId: string, email: string): Promise<StaffMember | null>
  /** Invite duplicate check without exposing authentication secrets. */
  emailInUse(storeId: string, email: string): Promise<boolean>
  findMember(storeId: string, userId: string): Promise<StaffMember | null>
  listMembers(storeId: string): Promise<StaffMember[]>
  createMember(member: StaffMember): Promise<StaffMember>
  /** Applies changes; with `expectedUpdatedAt`, refuses (conflict) when someone else saved first. */
  updateMember(storeId: string, userId: string, changes: Partial<StaffMember>, expectedUpdatedAt?: string): Promise<StaffMember>

  /** Upserts every permission and the system roles with their permissions; custom roles are untouched. */
  syncRegistry(storeId: string, permissions: { key: string; label: string; group: string; sensitive: boolean }[], presets: readonly PresetRole[]): Promise<void>
  listRoles(storeId: string): Promise<Role[]>
  findRole(storeId: string, key: string): Promise<Role | null>
  createRole(role: Role): Promise<Role>
  updateRole(storeId: string, key: string, changes: Partial<Pick<Role, "name" | "description" | "refundLimit" | "permissions">>, expectedUpdatedAt?: string): Promise<Role>
  deleteRole(storeId: string, key: string): Promise<void>

  rolesOf(storeId: string, userId: string): Promise<Role[]>
  listRoleAssignments(storeId: string): Promise<{ userId: string; roleId: string }[]>
  /** Replaces a member's roles. Refuses (conflict) to leave the store without an active Owner (A-008). */
  setRoles(storeId: string, userId: string, roleKeys: string[]): Promise<void>
  countActiveOwners(storeId: string): Promise<number>

  createInvite(invite: StaffInvite): Promise<StaffInvite>
  findInviteByTokenHash(tokenHash: string): Promise<StaffInvite | null>
  updateInvite(id: string, changes: Partial<StaffInvite>): Promise<void>
  listInvites(storeId: string): Promise<StaffInvite[]>

  createSession(session: StaffSession): Promise<void>
  findSessionByTokenHash(tokenHash: string): Promise<StaffSession | null>
  updateSession(id: string, changes: Partial<StaffSession>): Promise<void>
  listSessions(storeId: string, userId: string): Promise<StaffSession[]>
  /** Revokes every live session of a member, optionally keeping one (sign out elsewhere). */
  revokeSessions(storeId: string, userId: string, keepSessionId?: string): Promise<void>
}

/** Raw storage boundary; services receive explicitly bound operations. */
export type AdminRepository = ActorScoped<AdminOperations>
