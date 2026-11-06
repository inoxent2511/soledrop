"use client"

import Link from "next/link"
import {
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react"

import { ArrowRightIcon } from "@/components/icons"
import { SectionTitle } from "@/components/shared/section-title"
import { cn } from "@/lib/utils"

type Side = {
  id: "new" | "preloved"
  label: string
  viewAll: string
  row: ReactNode
}

/** A plain click (no new-tab modifier) that the switch handles in place of following the link. */
const isPlainClick = (event: MouseEvent) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey

/**
 * The home New Arrival row (D-075): the heading with "View all" on the right, a Brand New /
 * Pre-Loved switch under it on the left, and the four newest pairs of the chosen side. Both rows
 * are rendered on the server; the switch only shows one. "View all" follows the switch to the
 * matching New Arrivals tab. Without JavaScript the tabs are links to those tabs.
 */
export function NewArrivalSwitch({
  titleId,
  brandNew,
  preloved,
}: {
  titleId: string
  brandNew: ReactNode
  preloved: ReactNode
}) {
  const sides: Side[] = [
    { id: "new", label: "Brand New", viewAll: "/new-arrivals", row: brandNew },
    {
      id: "preloved",
      label: "Pre-Loved",
      viewAll: "/new-arrivals?tab=preloved",
      row: preloved,
    },
  ]
  const [active, setActive] = useState<Side["id"]>("new")
  const tabs = useRef<(HTMLAnchorElement | null)[]>([])
  const current = sides.find((side) => side.id === active)!

  const onKeyDown = (
    event: KeyboardEvent<HTMLAnchorElement>,
    index: number
  ) => {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl"
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[
      event.key as "ArrowRight" | "ArrowLeft"
    ]
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? sides.length - 1
          : step === undefined
            ? null
            : (index + step + sides.length) % sides.length
    if (next === null) return
    event.preventDefault()
    setActive(sides[next].id)
    tabs.current[next]?.focus()
  }

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div className="flex flex-col gap-4 md:gap-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <SectionTitle id={titleId}>New Arrival</SectionTitle>
          <Link
            href={current.viewAll}
            className="group flex min-h-11 items-center gap-2.5 text-16 font-bold uppercase underline-offset-4 hover:underline md:text-20"
          >
            View all
            <span className="sr-only">
              {" "}
              {current.label.toLowerCase()} new arrivals
            </span>
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-full bg-foreground text-brand transition-colors group-hover:bg-brand group-hover:text-brand-foreground md:size-11"
            >
              <ArrowRightIcon className="h-auto w-3.5 transition-transform group-hover:translate-x-0.5 md:w-4 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
            </span>
          </Link>
        </div>
        <div
          role="tablist"
          aria-label="New arrivals"
          className="flex w-fit rounded-full border-2 border-border bg-background p-1.5"
        >
          {sides.map((side, index) => {
            const selected = side.id === active
            return (
              <a
                key={side.id}
                ref={(node) => {
                  tabs.current[index] = node
                }}
                id={`${titleId}-tab-${side.id}`}
                href={side.viewAll}
                role="tab"
                aria-selected={selected}
                aria-controls={`${titleId}-panel-${side.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={(event) => {
                  if (!isPlainClick(event)) return
                  event.preventDefault()
                  setActive(side.id)
                }}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={cn(
                  "flex min-h-11 items-center gap-1.5 rounded-full px-3 text-16 font-bold whitespace-nowrap transition-colors sm:gap-2 sm:px-4 md:px-6 md:text-18",
                  selected
                    ? "bg-foreground text-background"
                    : "text-subtle-foreground hover:text-foreground"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2.5 rounded-full",
                    selected ? "bg-brand" : "bg-well"
                  )}
                />
                {side.label}
              </a>
            )
          })}
        </div>
      </div>
      {sides.map((side) => (
        <div
          key={side.id}
          id={`${titleId}-panel-${side.id}`}
          role="tabpanel"
          aria-labelledby={`${titleId}-tab-${side.id}`}
          hidden={side.id !== active}
        >
          {side.row}
        </div>
      ))}
    </div>
  )
}
