import "server-only"

import { serverEnv } from "@/lib/env.server"
import { createFixturesAdminRepository } from "@/server/admin/fixtures.repository"
import { createAdminService, type AdminService } from "@/server/admin/service"
import { createSupabaseAdminRepository } from "@/server/admin/supabase.repository"
import { dataDriver, selectRepository } from "@/server/db/driver"
import { platform } from "@/server/platform"
import { publish } from "@/server/platform/events"
import { fixtureAtomic } from "@/server/fixtures/atomic"
import { localStore } from "@/server/fixtures/store"
import { adminNetworkPolicy } from "@/server/admin/network-policy"

const repository = selectRepository({ fixtures: createFixturesAdminRepository, supabase: createSupabaseAdminRepository })

let service: AdminService | undefined

/** Staff identity, sessions and RBAC (one instance per process, so the registry syncs once). */
export const adminService = (): AdminService =>
  (service ??= createAdminService({
    repo: repository(),
    hit: (key, windowSeconds) => platform().hit(key, windowSeconds),
    audit: (entry) => platform().audit(entry),
    secret: serverEnv.SESSION_SECRET,
    allowIp: adminNetworkPolicy(serverEnv.ADMIN_IP_ALLOWLIST),
    atomic: dataDriver() === "local" ? (operation) => localStore().run(operation) : fixtureAtomic,
    notifySecurity: (email, action) => publish("auth.security_changed", { email, action }).then(() => undefined),
  }))

export type { RequestMeta } from "@/server/admin/service"
export type * from "@/server/admin/types"
