import "server-only"

import type { MediaOperations as DomainOperations } from "@/server/media/repository"
import { createMysqlMediaRepository } from "@/server/media/mysql.repository"
import { staffService } from "@/server/db/staff-service"

import { adminService } from "@/server/admin"
import { localService, selectRepository, unitOfWork } from "@/server/db/driver"
import { createFixturesMediaRepository } from "@/server/media/fixtures.repository"
import { createMediaService } from "@/server/media/service"

const repository = selectRepository<DomainOperations>({ mysql: createMysqlMediaRepository,  fixtures: createFixturesMediaRepository, })
export const mediaRepository = repository

export const mediaService = () =>
  staffService(localService(createMediaService({
    media: repository(),
    atomic: unitOfWork,
    audit: (staff, meta, entry) => adminService().recordAudit(staff, meta, entry),
    usage: (storeId, url) => repository().usage(storeId, url),
  }), ["setAlt", "remove"]))

export { mediaUrl, type MediaItem } from "@/server/media/types"
export type { MediaView } from "@/server/media/service"
