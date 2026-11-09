"use client"

import { Dialog } from "@base-ui/react/dialog"
import { ChevronLeftIcon, ChevronRightIcon, MenuIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, type PointerEvent } from "react"
import { flushSync } from "react-dom"

import { SearchIcon } from "@/components/icons"
import { mobileMenuTrigger } from "./mobile-menu-styles"
import { shortcutNav } from "@/content/navigation"
import type { MenuSection } from "@/features/navigation/types"
import { useRouteState } from "@/hooks/use-route-state"
import { cn } from "@/lib/utils"

/** [] is the root; [section] lists that category's Brand New / Pre-Loved choices. */
type Path = [] | [number]

const SWIPE_CLOSE = 64
const row = "flex min-h-12 w-full items-center justify-between gap-4 py-2 text-start"

/**
 * Below `lg` the primary nav moves into a full-height drawer (D-007). Each category drills into the
 * same Brand New / Pre-Loved choice as the desktop dropdown (D-045), with a back button and
 * breadcrumb; a category without choices (New Arrival, D-052) is a plain link. The root also has shortcuts and a search field. Esc, the close button, a swipe towards the start edge, the browser Back button
 * and any navigation close it; focus moves to each level's heading and returns to the menu button.
 */
export function MobileMenu({ sections }: { sections: MenuSection[] }) {
  const [open, setOpen] = useRouteState(false)
  const [path, setPath] = useRouteState<Path>([])
  const pathname = usePathname()
  const heading = useRef<HTMLHeadingElement>(null)
  const pushedHistory = useRef(false)
  const swipeStart = useRef<number | null>(null)

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next) setPath([])
    if (next && !pushedHistory.current) {
      window.history.pushState(window.history.state, "", window.location.href)
      pushedHistory.current = true
    } else if (!next && pushedHistory.current) {
      pushedHistory.current = false
      window.history.back()
    }
  }

  /** A link was followed: close without going Back, which would race the navigation. */
  const closeForNavigation = () => {
    pushedHistory.current = false
    setOpen(false)
    setPath([])
  }

  useEffect(() => {
    const onPopState = () => {
      if (!pushedHistory.current) return
      pushedHistory.current = false
      setOpen(false)
      setPath([])
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [setOpen, setPath])

  // A navigation closes the drawer (route-scoped state); the history entry it pushed is spent.
  useEffect(() => {
    pushedHistory.current = false
  }, [pathname])

  // The clicked row unmounts with the level change; focusing the new heading in the same task keeps
  // focus inside the level instead of letting the dialog's focus manager fall back to the popup.
  const go = (next: Path) => {
    flushSync(() => setPath(next))
    heading.current?.focus()
  }

  const [sectionIndex] = path
  const section = sectionIndex === undefined ? null : (sections[sectionIndex] ?? null)
  const title = section?.label ?? "Menu"

  const onPointerDown = (event: PointerEvent) => {
    swipeStart.current = event.pointerType === "touch" ? event.clientX : null
  }
  const onPointerUp = (event: PointerEvent) => {
    if (swipeStart.current === null) return
    const distance = event.clientX - swipeStart.current
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl"
    if ((rtl ? distance : -distance) > SWIPE_CLOSE) changeOpen(false)
    swipeStart.current = null
  }

  const breadcrumb = ["Menu", ...(section ? [section.label] : [])]

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger aria-label="Open menu" className={mobileMenuTrigger}>
        <MenuIcon aria-hidden="true" className="size-6" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-overlay bg-foreground/60 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          className="fixed inset-y-0 start-0 z-overlay flex w-full max-w-sm flex-col bg-foreground text-background transition-transform duration-200 ease-out data-ending-style:-translate-x-full data-starting-style:-translate-x-full rtl:data-ending-style:translate-x-full rtl:data-starting-style:translate-x-full"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border-strong ps-5 pe-2 pt-[env(safe-area-inset-top)]">
            <Dialog.Title className={path.length > 0 ? "sr-only" : "flex min-h-14 items-center text-14 font-bold tracking-wide-2 text-muted-foreground uppercase"}>Menu</Dialog.Title>
            {path.length > 0 ? (
              <button type="button" onClick={() => go([])} className="me-auto flex min-h-14 items-center gap-1 text-16 font-bold">
                <ChevronLeftIcon aria-hidden="true" className="size-5 rtl:-scale-x-100" />
                Back<span className="sr-only"> to {breadcrumb.at(-2)}</span>
              </button>
            ) : null}
            <Dialog.Close aria-label="Close menu" className="flex size-11 items-center justify-center">
              <XIcon aria-hidden="true" className="size-6" />
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto overscroll-contain px-5 pt-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
            {path.length > 0 ? (
              <div className="flex flex-col gap-2">
                <nav aria-label="Breadcrumb">
                  <ol className="flex flex-wrap gap-x-2 text-14 text-muted-foreground">
                    {breadcrumb.map((crumb, index) => (
                      <li key={crumb} className="flex gap-2">
                        {index > 0 ? <span aria-hidden="true">/</span> : null}
                        <span aria-current={index === breadcrumb.length - 1 ? "location" : undefined}>{crumb}</span>
                      </li>
                    ))}
                  </ol>
                </nav>
                <h2 ref={heading} tabIndex={-1} className={cn("text-32 font-black uppercase outline-none focus-visible:shadow-none", section?.tone === "brand" && "text-brand")}>
                  {title}
                </h2>
              </div>
            ) : (
              <form role="search" action="/search" className="flex h-12 items-center gap-3 rounded-lg border-2 border-border-strong px-3 outline-offset-2 outline-ring focus-within:border-brand focus-within:outline-3">
                <SearchIcon className="size-5 shrink-0" />
                <label htmlFor="drawer-search" className="sr-only">
                  Search shoes, brands and styles
                </label>
                <input id="drawer-search" name="q" type="search" placeholder="Search shoes and brands" minLength={2} maxLength={80} autoComplete="off" enterKeyHint="search" className="h-full min-w-0 flex-1 bg-transparent text-16 outline-none placeholder:text-muted-foreground focus-visible:shadow-none" />
              </form>
            )}

            <nav aria-label="Mobile" className="flex flex-col gap-8">
              {path.length === 0 ? (
                <ul className="flex flex-col">
                  {sections.map((item, index) => (
                    <li key={item.href}>
                      {item.options.length === 0 ? (
                        <Link
                          href={item.href}
                          onClick={closeForNavigation}
                          aria-current={pathname === item.href ? "page" : undefined}
                          className={cn(row, "text-28 font-black uppercase", (item.tone === "brand" || pathname === item.href) && "text-brand")}
                        >
                          {item.label}
                        </Link>
                      ) : (
                        <button type="button" onClick={() => go([index])} className={cn(row, "text-28 font-black uppercase", item.tone === "brand" && "text-brand")}>
                          {item.label}
                          <ChevronRightIcon aria-hidden="true" className="size-6 shrink-0 rtl:-scale-x-100" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : section ? (
                <ul className="flex flex-col divide-y divide-border-strong">
                  {section.options.map((option) => (
                    <li key={option.kind} className="py-1">
                      <Link
                        href={option.href}
                        onClick={closeForNavigation}
                        className={cn(row, "-mx-3 w-auto rounded-lg px-3 text-22 font-bold transition-colors hover:bg-brand hover:text-brand-foreground active:bg-brand active:text-brand-foreground")}
                      >
                        {option.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}

              {path.length === 0 ? (
                <ul className="flex flex-col border-t border-border-strong pt-4">
                  {shortcutNav.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} onClick={closeForNavigation} className={cn(row, "text-18 font-bold text-muted-foreground")}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link href="/account" onClick={closeForNavigation} className={cn(row, "text-18 font-bold text-muted-foreground")}>
                      My Account
                    </Link>
                  </li>
                </ul>
              ) : null}
            </nav>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
