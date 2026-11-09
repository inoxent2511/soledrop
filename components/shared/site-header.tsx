import Link from "next/link"

import { LogoIcon } from "@/components/icons"
import { CartLink } from "@/components/shared/cart-link"
import { Container } from "@/components/shared/container"
import { HeaderMobileMenu, HeaderAccount, HeaderCart, HeaderSearch } from "@/components/shared/header-controls"
import { NavMenu } from "@/features/navigation/components/nav-menu"
import { cn } from "@/lib/utils"
import { navigationData } from "@/server/storefront"

type SiteHeaderProps = {
  /** `minimal` drops the nav, as the cart screens do (design 09/10); the bag icon stays a plain link there. */
  variant?: "full" | "minimal"
}

const iconLink =
  "relative flex text-background transition-colors hover:text-brand after:absolute after:-inset-2.5"

/**
 * The black site header: logo, primary nav with Brand New / Pre-Loved dropdowns (lg+) or the menu
 * drawer, and the search, account and bag controls. Closed, it is the design's header; each control
 * is a plain link until JavaScript turns it into its panel (D-045, D-040, D-041).
 */
export async function SiteHeader({ variant = "full" }: SiteHeaderProps) {
  const sections = variant === "full" ? await navigationData() : []

  return (
    <header className="sticky top-0 z-nav bg-foreground text-background shadow-header-rule">
      {/* Below lg a flex row whose logo cell may shrink (BUG-001: two equal grid columns were narrower than menu + logo at 390). */}
      <Container className="flex h-14 items-center justify-between gap-3 lg:grid lg:grid-cols-header lg:h-21.5 3xl:items-start">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3 3xl:pt-6.75">
          {variant === "full" ? <HeaderMobileMenu sections={sections} /> : null}
          <Link href="/" aria-label="Sole Drop — home" className="flex min-w-0">
            <LogoIcon className="h-auto w-36 max-w-full sm:w-44 lg:w-60" />
          </Link>
        </div>

        {variant === "full" ? <NavMenu sections={sections} /> : <span className="hidden lg:block" />}

        <div className="flex shrink-0 items-center gap-4 justify-self-end sm:gap-7.5 3xl:items-start 3xl:pt-7.25">
          <HeaderSearch className={cn(iconLink, "3xl:pt-0.5")} />
          <HeaderAccount className={cn(iconLink, "3xl:pt-0.75")} />
          {variant === "full" ? <HeaderCart className={iconLink} /> : <CartLink className={iconLink} />}
        </div>
      </Container>
    </header>
  )
}
