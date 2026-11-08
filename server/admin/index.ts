import "server-only"
import { createMysqlAdminRepository, rehashStaffPassword } from "@/server/admin/mysql.repository"

import { serverEnv } from "@/lib/env.server"
import { createFixturesAdminRepository } from "@/server/admin/fixtures.repository"
import { createAdminService, type AdminService } from "@/server/admin/service"
import { createSupabaseAdminRepository } from "@/server/admin/supabase.repository"
import { dataDriver, localService, selectRepository } from "@/server/db/driver"
import { platform } from "@/server/platform"
import { publish } from "@/server/platform/events"
import { fixtureAtomic } from "@/server/fixtures/atomic"
import { localStore, withFixtureStore } from "@/server/fixtures/store"
import { adminNetworkPolicy } from "@/server/admin/network-policy"
import { systemActor } from "@/server/db/actor"
import { currentActor } from "@/server/db/context"
import { authTransaction } from "@/server/db/auth.repository"
import { realmService } from "@/server/db/realm-service"
import { staffService } from "@/server/db/staff-service"

const repository = selectRepository({ mysql: createMysqlAdminRepository,  fixtures: createFixturesAdminRepository, supabase: createSupabaseAdminRepository })

let service: AdminService | undefined

/** Staff identity, sessions and RBAC (one instance per process, so the registry syncs once). */
export const adminService = (): AdminService => {
  if (service) return service
  const base = createAdminService({
    repo: repository(),
    hit: (key, windowSeconds) => platform().hit(key, windowSeconds),
    audit: (entry) => platform().audit(entry),
    secret: serverEnv.SESSION_SECRET,
    allowIp: adminNetworkPolicy(serverEnv.ADMIN_IP_ALLOWLIST),
    atomic: dataDriver() === "mysql" ? (operation) => authTransaction(systemActor(currentActor().storeId, "auth:staff"), operation) : dataDriver() === "local" ? (operation) => localStore().run(operation) : (operation) => withFixtureStore(currentActor(), () => fixtureAtomic(operation)),
    rehashPassword: dataDriver() === "mysql" ? (member, next) => rehashStaffPassword(systemActor(member.storeId, "auth:staff"), member.userId, member.passwordHash!, next) : undefined,
    notifySecurity: (email, action) => publish("auth.security_changed", { email, action }).then(() => undefined),
  })
  const auth = () => systemActor(serverEnv.STORE_ID, "auth:staff")
  service = staffService(localService(realmService(base, {
    ensureRegistry: auth, login: auth, resolve: auth, logout: auth, beginEnrolment: auth, confirmEnrolment: auth, verifyMfa: auth,
    stepUp: auth, changePassword: auth, acceptInvite: auth, peekInvite: auth,
    listSessions: auth, revokeSession: auth, signOutEverywhere: auth,
    recordAudit: (args) => args[0] === null ? auth() : null,
  }), ["regenerateRecoveryCodes", "revokeSession", "signOutEverywhere", "invite", "revokeInvite", "setStaffRoles", "setStaffStatus", "resetMfa", "saveRole", "deleteRole"]))
  return service
}

export type { RequestMeta } from "@/server/admin/service"
export type * from "@/server/admin/types"
