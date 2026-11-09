"use client"

import Link from "next/link"
import {
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react"

import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"

export type KindTabId = "new" | "preloved"

export type KindTab = {
  id: KindTabId
  label: string
  /** "brand-new" / "pre-loved", used in the status line ("Showing 8 of 24 brand-new pairs"). */
  noun: string
  /** Every pair of this kind on the page; `cards` holds the first of them, rendered on the server. */
  total: number
  cards: ReactNode[]
  /** Where to keep shopping: the empty state's button, and "See all" once every loaded card shows and more exist. */
  seeAllHref: string
  /** The empty state's line under the title. */
  emptyText: string
}

/** What differs between the pages that use these tabs (New Arrivals D-052, Sale D-053). */
export type KindTabsPage = {
  pathname: string
  /** Prefix for the tab and panel ids (`arrivals` → `#arrivals-panel-new`). */
  idPrefix: string
  /** The tablist's accessible name. */
  label: string
  /** The empty state's title; plain data, since the page renders on the server. */
  emptyTitle: string
}

/** 12 fills whole rows at every column count the grid uses (1, 2, 3 and 4). */
export const KIND_TABS_STEP = 12

const tabHref = (pathname: string, id: KindTabId, shown = KIND_TABS_STEP) => {
  const params = new URLSearchParams()
  if (id !== "new") params.set("tab", id)
  if (shown > KIND_TABS_STEP) params.set("show", String(shown))
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

/** A plain click (no new-tab modifier) that this component handles in place of following the link. */
const isPlainClick = (event: MouseEvent) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey

/**
 * Brand New / Pre-Loved tabs on a page of its own (New Arrivals, Sale). The tabs swap the grid in
 * place and keep the URL in step (`?tab=preloved`) without a navigation, so a refresh or a shared
 * link opens the same tab. Without JavaScript the tabs and LOAD MORE are ordinary links the server
 * answers. Arrow keys, Home and End move between the tabs (automatic activation).
 */
export function KindTabs({
  page,
  tabs,
  initialTab,
  initialShown,
}: {
  page: KindTabsPage
  tabs: KindTab[]
  initialTab: KindTabId
  initialShown: number
}) {
  const [active, setActive] = useState(initialTab)
  const [shown, setShown] = useState<Record<KindTabId, number>>({
    new: initialTab === "new" ? initialShown : KIND_TABS_STEP,
    preloved: initialTab === "preloved" ? initialShown : KIND_TABS_STEP,
  })
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const grids = useRef<Partial<Record<KindTabId, HTMLUListElement | null>>>({})
  const href = (id: KindTabId, count?: number) =>
    tabHref(page.pathname, id, count)
  const tabId = (id: KindTabId) => `${page.idPrefix}-tab-${id}`
  const panelId = (id: KindTabId) => `${page.idPrefix}-panel-${id}`

  const sync = (id: KindTabId, count: number) =>
    window.history.replaceState(window.history.state, "", href(id, count))

  const select = (id: KindTabId) => {
    setActive(id)
    sync(id, shown[id])
  }

  const onTabKeyDown = (
    event: KeyboardEvent<HTMLAnchorElement>,
    index: number
  ) => {
    const last = tabs.length - 1
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl"
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[
      event.key as "ArrowRight" | "ArrowLeft"
    ]
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : step === undefined
            ? null
            : (index + step + tabs.length) % tabs.length
    if (next === null) return
    event.preventDefault()
    const tab = tabs[next]
    if (!tab) return
    tabRefs.current[next]?.focus()
    select(tab.id)
  }

  const loadMore = (tab: KindTab) => {
    const from = shown[tab.id]
    const count = Math.min(from + KIND_TABS_STEP, tab.cards.length)
    setShown((current) => ({ ...current, [tab.id]: count }))
    sync(tab.id, count)
    // Focus moves to the first pair just revealed, so keyboard users continue where the new cards start.
    requestAnimationFrame(() => {
      grids.current[tab.id]?.children[from]
        ?.querySelector<HTMLAnchorElement>("a:not([tabindex='-1'])")
        ?.focus()
    })
  }

  return (
    <div className="flex flex-col gap-6 md:gap-10">
      <div
        role="tablist"
        aria-label={page.label}
        className="flex rounded-full border-2 border-border bg-background p-1.5 md:self-start"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === active
          return (
            <a
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node
              }}
              id={tabId(tab.id)}
              href={href(tab.id, shown[tab.id])}
              role="tab"
              aria-selected={selected}
              aria-controls={panelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              onClick={(event) => {
                if (!isPlainClick(event)) return
                event.preventDefault()
                select(tab.id)
              }}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              className={cn(
                "flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-3 text-16 font-bold whitespace-nowrap transition-colors md:min-w-50 md:flex-none md:gap-3 md:px-6 md:text-20",
                selected
                  ? "bg-foreground text-background"
                  : "text-subtle-foreground hover:text-foreground"
              )}
            >
              {`${tab.label} `}
              <span
                className={cn(
                  "flex h-7 min-w-9 items-center justify-center rounded-full px-2 text-14 font-bold tabular-nums",
                  selected
                    ? "bg-brand text-brand-foreground"
                    : "bg-well text-subtle-foreground"
                )}
              >
                {tab.total}
                <span className="sr-only"> pairs</span>
              </span>
            </a>
          )
        })}
      </div>

      {tabs.map((tab) => {
        const visible = Math.min(shown[tab.id], tab.cards.length)
        const more = visible < tab.cards.length
        return (
          <div
            key={tab.id}
            id={panelId(tab.id)}
            role="tabpanel"
            aria-labelledby={tabId(tab.id)}
            hidden={tab.id !== active}
            className="flex flex-col gap-10 md:gap-14"
          >
            {tab.cards.length === 0 ? (
              <div className="flex flex-col items-start gap-6 rounded-xl border-2 border-border bg-background p-8 md:p-12">
                <p className="text-28 font-extrabold uppercase md:text-40">
                  {page.emptyTitle}
                </p>
                <p className="max-w-130 text-18 text-subtle-foreground">
                  {tab.emptyText}
                </p>
                <Link
                  href={tab.seeAllHref}
                  className={cn(
                    buttonVariants({ tone: "ink-light", size: "md" }),
                    "rounded-md"
                  )}
                >
                  Browse {tab.label}
                </Link>
              </div>
            ) : (
              <>
                <ul
                  ref={(node) => {
                    grids.current[tab.id] = node
                  }}
                  className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3 2xl:grid-cols-4 3xl:gap-8.5"
                >
                  {tab.cards.slice(0, visible).map((card, index) => (
                    <li key={index}>{card}</li>
                  ))}
                </ul>
                <div className="flex flex-col items-center gap-5">
                  {/* Not shown on screen (the owner's call); kept so screen readers hear how far Load more got. */}
                  <p aria-live="polite" className="sr-only">
                    You&apos;ve seen {visible} of {tab.total} {tab.noun} pairs
                  </p>
                  {more ? (
                    <a
                      href={href(tab.id, visible + KIND_TABS_STEP)}
                      onClick={(event) => {
                        if (!isPlainClick(event)) return
                        event.preventDefault()
                        loadMore(tab)
                      }}
                      className={cn(
                        buttonVariants({ tone: "ink-light", size: "md" }),
                        "w-full rounded-md sm:w-80"
                      )}
                    >
                      Load more
                    </a>
                  ) : tab.total > visible ? (
                    <Link
                      href={tab.seeAllHref}
                      className={cn(
                        buttonVariants({ tone: "ink-light", size: "md" }),
                        "w-full rounded-md sm:w-80"
                      )}
                    >
                      See all {tab.label}
                    </Link>
                  ) : null}
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
