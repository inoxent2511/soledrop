"use client"

import { MenuIcon } from "lucide-react"
import Link from "next/link"
import { SearchIcon, UserIcon } from "@/components/icons"
import { CartLink } from "@/components/shared/cart-link"
import type { MenuSection } from "@/features/navigation/types"
import { useAccount } from "@/hooks/api/account/queries"
import { useCart } from "@/hooks/api/cart/queries"
import { DeferredControl } from "./deferred-control"
import { mobileMenuTrigger } from "./mobile-menu-styles"

const loadMenu = () => import("./mobile-menu").then((module) => module.MobileMenu)
const loadSearch = () => import("@/features/search/components/search-overlay").then((module) => module.SearchOverlay)
const loadAccount = () => import("@/features/account/components/account-menu").then((module) => module.AccountMenu)
const loadCart = () => import("@/features/cart/components/mini-cart").then((module) => module.MiniCart)

export function HeaderMobileMenu(props: { sections: MenuSection[] }) {
  return <DeferredControl load={loadMenu} props={props} media="(max-width: 1023px)" fallback={<button type="button" aria-label="Open menu" className={mobileMenuTrigger}><MenuIcon aria-hidden="true" className="size-6" /></button>} />
}

export function HeaderSearch(props: { className: string }) {
  return <DeferredControl load={loadSearch} props={props} fallback={<Link href="/search" aria-label="Search" className={props.className}><SearchIcon /></Link>} />
}

export function HeaderAccount(props: { className: string }) {
  // Keep observers mounted when the fallback becomes a panel, so reads are not cancelled.
  const { data } = useAccount(), customer = data?.customer
  return <DeferredControl load={loadAccount} props={props} hoverOnUpgrade fallback={<Link href="/account" aria-label={customer ? `Account: ${customer.fullName}` : "Account"} className={props.className}><UserIcon /></Link>} />
}

export function HeaderCart(props: { className: string }) {
  useCart()
  return <DeferredControl load={loadCart} props={props} fallback={<CartLink className={props.className} />} />
}
