import "server-only"

import type { SearchOperations as DomainOperations } from "@/server/search/repository"
import { createMysqlSearchRepository } from "@/server/search/mysql.repository"

import { selectRepository } from "@/server/db/driver"
import { createFixturesSearchRepository } from "@/server/search/fixtures.repository"
import { createSearchService } from "@/server/search/service"

const repository = selectRepository<DomainOperations>({ mysql: createMysqlSearchRepository,  fixtures: createFixturesSearchRepository, })

/** The raw search repository (admin search tools). */
export const searchRepository = repository

export const searchService = () => createSearchService({ search: repository() })

export type * from "@/server/search/types"
