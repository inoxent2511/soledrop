import "server-only"

import type { MediaOperations as DomainOperations } from "@/server/media/repository"

import { serverEnv } from "@/lib/env.server"
import { selectRepository } from "@/server/db/driver"
import { createFixturesMediaRepository } from "@/server/media/fixtures.repository"
import { createMysqlMediaRepository } from "@/server/media/mysql.repository"
import { DomainError } from "@/server/shared/errors"

const repository = selectRepository<DomainOperations>({ fixtures: createFixturesMediaRepository, mysql: createMysqlMediaRepository })

export async function assertMediaReferences(storeId: string, urls: string[]) {
  for (const url of new Set(urls)) {
    if (serverEnv.DATA_DRIVER === "fixtures" && /^\/images\//.test(url)) continue
    const id = /^\/media\/([0-9a-f-]{36})\.webp$/.exec(url)?.[1]
    if (!id || !await repository().find(storeId, id)) throw new DomainError("validation", "An image is no longer available. Choose it again from Media.")
  }
}
