"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react"

import { useHoverIntent } from "@/features/navigation/lib/use-hover-intent"
import type { MenuSection } from "@/features/navigation/types"
import { useRouteState } from "@/hooks/use-route-state"
import { cn } from "@/lib/utils"

const OPEN_DELAY = 120
const CLOSE_DELAY = 200

const tabClass = "cursor-pointer text-20 font-bold underline-offset-5 transition-colors hover:text-brand hover:underline xl:text-22 3xl:text-24"

const panelId = (index: number) => `nav-panel-${index}`
const noop = () => () => {}

/** Focusable links inside a panel, in reading order (for Arrow-key roving). */
const panelLinks = (panel: HTMLElement | null) => [...(panel?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [])]

/**
 * Desktop primary nav with a small dropdown under every item (D-045): Brand New and Pre-Loved
 * within that tab, nothing else. The tabs only open their dropdown and never navigate (D-049): they
 * are disclosure buttons. Hover intent (120 ms open, 200 ms close); a click or tap opens (a second
 * click closes, unless hover opened it); Enter, Space or ArrowDown opens and enters, Arrow keys
 * inside, Escape closes and returns focus. One dropdown at a time; it closes on route change,
 * outside click and when focus leaves. Before hydration (or without JavaScript) CSS shows a tab's
 * dropdown while it is hovered or holds focus. A section without options (New Arrival, D-052) is a
 * plain link to its own page instead, marked as the current page while it is open.
 */
export function NavMenu({ sections }: { sections: MenuSection[] }) {
  const [open, setOpen] = useRouteState<number | null>(null)
  const hydrated = useSyncExternalStore(noop, () => true, () => false)
  const pathname = usePathname()
  const navRef = useRef<HTMLElement>(null)
  const triggers = useRef<(HTMLButtonElement | HTMLAnchorElement | null)[]>([])
  const panels = useRef<(HTMLDivElement | null)[]>([])
  const pointerType = useRef<string>("mouse")
  const intent = useHoverIntent({ openDelay: OPEN_DELAY, closeDelay: CLOSE_DELAY })
  const cancelIntent = intent.cancel
  const intentPathname = useRef(pathname)

  // Navigation closes the dropdown (route-scoped state); a pending hover must not reopen it.
  // The mount effect must not cancel a hover that arrived just after hydration.
  useEffect(() => {
    if (intentPathname.current === pathname) return
    intentPathname.current = pathname
    cancelIntent()
  }, [pathname, cancelIntent])

  useEffect(() => {
    if (open === null) return
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpen(null)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open, setOpen])

  const close = (returnFocus: boolean) => {
    const index = open
    intent.cancel()
    setOpen(null)
    if (returnFocus && index !== null) triggers.current[index]?.focus()
  }

  const openAndEnter = (index: number, which: "first" | "last") => {
    intent.cancel()
    setOpen(index)
    requestAnimationFrame(() => {
      const links = panelLinks(panels.current[index])
      ;(which === "first" ? links[0] : links.at(-1))?.focus()
    })
  }

  const hasMenu = (index: number) => (sections[index]?.options.length ?? 0) > 0

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const count = sections.length
    // A direct link keeps Enter (follow it) and only joins the Arrow-key roving between tabs.
    if (!hasMenu(index) && event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
    if (event.key === "ArrowDown" || event.key === " " || event.key === "Enter") {
      event.preventDefault()
      openAndEnter(index, "first")
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      openAndEnter(index, "last")
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault()
      const forward = (event.key === "ArrowRight") === (getComputedStyle(event.currentTarget).direction !== "rtl")
      const next = (index + (forward ? 1 : count - 1)) % count
      triggers.current[next]?.focus()
      if (open !== null) setOpen(hasMenu(next) ? next : null)
    } else if (event.key === "Escape" && open !== null) {
      event.preventDefault()
      close(true)
    }
  }

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      close(true)
      return
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return
    const links = panelLinks(event.currentTarget)
    const current = links.indexOf(document.activeElement as HTMLAnchorElement)
    if (current === -1) return
    event.preventDefault()
    const target =
      event.key === "Home" ? 0 : event.key === "End" ? links.length - 1 : (current + (event.key === "ArrowDown" ? 1 : links.length - 1)) % links.length
    links[target]?.focus()
  }

  const onItemPointerEnter = (event: PointerEvent, index: number) => {
    pointerType.current = event.pointerType
    if (event.pointerType !== "mouse") return
    if (!hasMenu(index)) {
      // Moving onto a direct link closes whichever dropdown is open, as moving to another tab would.
      intent.cancel()
      if (open !== null) intent.schedule("close", () => setOpen(null))
      return
    }
    if (open !== null) {
      intent.cancel()
      setOpen(index)
    } else intent.schedule("open", () => setOpen(index))
  }

  const onItemPointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return
    intent.schedule("close", () => setOpen(null))
  }

  return (
    <nav
      ref={navRef}
      aria-label="Primary"
      className="hidden lg:flex lg:gap-10 xl:gap-14 3xl:gap-18.5 3xl:pt-7.25"
      onBlur={(event) => {
        // Only focus moving to something outside closes: a null target means the focused link was
        // hidden (hover switched dropdowns, BUG-007) or the window lost focus; outside clicks close separately.
        const next = event.relatedTarget as Node | null
        if (open !== null && next && !event.currentTarget.contains(next)) setOpen(null)
      }}
    >
      {sections.map((section, index) => {
        const expanded = open === index
        if (!hasMenu(index)) {
          const current = pathname === section.href
          return (
            <div key={section.href} className="relative flex" onPointerEnter={(event) => onItemPointerEnter(event, index)}>
              <Link
                ref={(node) => {
                  triggers.current[index] = node
                }}
                href={section.href}
                aria-current={current ? "page" : undefined}
                onKeyDown={(event) => onTriggerKeyDown(event, index)}
                className={cn(tabClass, section.tone === "brand" && "text-brand", current && "text-brand underline")}
              >
                {section.label}
              </Link>
            </div>
          )
        }
        return (
          <div key={section.href} className="group relative flex" onPointerEnter={(event) => onItemPointerEnter(event, index)} onPointerLeave={onItemPointerLeave}>
            <button
              ref={(node) => {
                triggers.current[index] = node
              }}
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId(index)}
              onKeyDown={(event) => onTriggerKeyDown(event, index)}
              onClick={() => {
                intent.cancel()
                // A mouse click on a tab that hover already opened keeps it open; otherwise it toggles.
                setOpen(expanded && pointerType.current !== "mouse" ? null : index)
              }}
              className={cn(
                tabClass,
                section.tone === "brand" && "text-brand",
                expanded && "text-brand underline",
              )}
            >
              {section.label}
            </button>
            {/* The top padding is a hover bridge: the pointer crosses it without leaving the item; the
                negative start offset lines the option labels up with the tab label. */}
            <div
              ref={(node) => {
                panels.current[index] = node
              }}
              id={panelId(index)}
              role="region"
              aria-label={`${section.label} menu`}
              hidden={hydrated ? !expanded : undefined}
              onKeyDown={onPanelKeyDown}
              className={cn("absolute -start-5 top-full pt-4", !hydrated && "hidden group-focus-within:block group-hover:block")}
            >
              <NavPanel section={section} onNavigate={() => close(false)} />
            </div>
          </div>
        )
      })}
    </nav>
  )
}

function NavPanel({ section, onNavigate }: { section: MenuSection; onNavigate: () => void }) {
  return (
    <ul className="flex w-52 flex-col divide-y divide-border rounded-2xl bg-background p-2 text-foreground shadow-card-lift motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-150">
      {section.options.map((option) => (
        <li key={option.kind} className="py-1 first:pt-0 last:pb-0">
          <Link
            href={option.href}
            onClick={onNavigate}
            className="flex min-h-11 items-center rounded-lg px-3 text-16 font-bold whitespace-nowrap outline-none transition-colors hover:bg-brand hover:text-brand-foreground focus-visible:bg-brand focus-visible:text-brand-foreground focus-visible:shadow-none"
          >
            {option.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}
