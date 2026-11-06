import type { ReactNode } from "react"

import { AnnouncementBar } from "@/components/shared/announcement-bar"
import { SiteFooter } from "@/components/shared/site-footer"
import { SiteHeader } from "@/components/shared/site-header"

export const dynamic = "force-dynamic"

/** Home is the only screen with the announcement bar above the header (design 01). */
export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AnnouncementBar />
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter newsletter />
    </>
  )
}
