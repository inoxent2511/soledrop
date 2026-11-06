import type { ReactNode } from "react"

import { SiteFooter } from "@/components/shared/site-footer"
import { SiteHeader } from "@/components/shared/site-header"

export const dynamic = "force-dynamic"

/** Listing, product, content, account and order pages: full header and the shared footer. */
export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </>
  )
}
