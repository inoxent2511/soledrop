import "server-only"
import { createMysqlPlatformRepository } from "@/server/platform/mysql.repository"

import { selectRepository } from "@/server/db/driver"
import { createFixturesPlatformRepository } from "@/server/platform/fixtures.repository"
import { createSupabasePlatformRepository } from "@/server/platform/supabase.repository"

export const platform = selectRepository({ mysql: createMysqlPlatformRepository,  fixtures: createFixturesPlatformRepository, supabase: createSupabasePlatformRepository })
export type * from "@/server/platform/types"
