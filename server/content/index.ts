import "server-only"

import { refreshStorefront } from "@/server/shared/revalidate"
import { serverEnv } from "@/lib/env.server"
import { adminService } from "@/server/admin"
import { createStaffContent } from "@/server/content/staff"
import { createFixturesContentRepository } from "@/server/content/fixtures.repository"
import { createContentService } from "@/server/content/service"
import { createSupabaseContentRepository } from "@/server/content/supabase.repository"
import { selectRepository } from "@/server/db/driver"
import { publish } from "@/server/platform/events"

const repository = selectRepository({
  fixtures: createFixturesContentRepository,
  supabase: createSupabaseContentRepository,
})

/** The raw content repository (admin newsletter list). */
export const contentRepository = repository

export const contentService = () =>
  createContentService({
    content: repository(),
    publish,
    secret: serverEnv.SESSION_SECRET,
  })

/** Staff (admin) pages and FAQs. */
export const staffContent = () =>
  createStaffContent({
    content: repository(),
    audit: (staff, meta, entry) =>
      adminService().recordAudit(staff, meta, entry),
    revalidate: () => refreshStorefront(),
  })

export type * from "@/server/content/types"
