import "server-only"
import { createMysqlSearchRepository } from "@/server/search/mysql.repository"

import { selectRepository } from "@/server/db/driver"
import { createFixturesSearchRepository } from "@/server/search/fixtures.repository"
import { createSearchService } from "@/server/search/service"
import { createSupabaseSearchRepository } from "@/server/search/supabase.repository"

const repository = selectRepository({ mysql: createMysqlSearchRepository,  fixtures: createFixturesSearchRepository, supabase: createSupabaseSearchRepository })

/** The raw search repository (admin search tools). */
export const searchRepository = repository

export const searchService = () => createSearchService({ search: repository() })

export type * from "@/server/search/types"
