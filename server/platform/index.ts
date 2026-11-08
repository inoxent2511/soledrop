import "server-only"

import type { PlatformOperations as DomainOperations } from "@/server/platform/repository"
import { createMysqlPlatformRepository } from "@/server/platform/mysql.repository"

import { selectRepository } from "@/server/db/driver"
import { createFixturesPlatformRepository } from "@/server/platform/fixtures.repository"

export const platform = selectRepository<DomainOperations>({ mysql: createMysqlPlatformRepository,  fixtures: createFixturesPlatformRepository, })
export type * from "@/server/platform/types"
