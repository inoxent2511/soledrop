import "server-only"

import { serverEnv } from "@/lib/env.server"
import { createFixturesAdminRepository } from "@/server/admin/fixtures.repository"
import { createAdminService, type AdminService } from "@/server/admin/service"
import { createSupabaseAdminRepository } from "@/server/admin/supabase.repository"
import { selectRepository } from "@/server/db/driver"
import { platform } from "@/server/platform"

const repository = selectRepository({ fixtures: createFixturesAdminRepository, supabase: createSupabaseAdminRepository })

let service: AdminService | undefined

/** Staff identity, sessions and RBAC (one instance per process, so the registry syncs once). */
export const adminService = (): AdminService =>
  (service ??= createAdminService({
    repo: repository(),
    hit: (key, windowSeconds) => platform().hit(key, windowSeconds),
    audit: (entry) => platform().audit(entry),
    secret: serverEnv.SESSION_SECRET,
  }))

export type { RequestMeta } from "@/server/admin/service"
export type * from "@/server/admin/types"
