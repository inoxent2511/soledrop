import type { ReactNode } from "react"

import { SiteFooter } from "@/components/shared/site-footer"
import { SiteHeader } from "@/components/shared/site-header"

export const dynamic = "force-dynamic"

/** Bag and checkout: the header without navigation (designs 09/10) so the purchase path stays focused. */
export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader variant="minimal" />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </>
  )
}
