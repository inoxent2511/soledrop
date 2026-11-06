"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  listingHref,
  type ListingState,
} from "@/features/catalog/lib/listing-url"
import { SORT_OPTIONS } from "@/features/catalog/schemas/query"
import { cn } from "@/lib/utils"

export type ListingView = "grid" | "list"

/** value → label, so the trigger shows the label before the list has ever opened. */
const sortLabels = Object.fromEntries(
  SORT_OPTIONS.map((option) => [option.value, option.label])
)

function GridGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 fill-current">
      <path d="M0 0h8.5v8.5H0zM11.5 0H20v8.5h-8.5zM0 11.5h8.5V20H0zM11.5 11.5H20V20h-8.5z" />
    </svg>
  )
}

function ListGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 14 14"
      className="h-3.5 w-3.5 fill-current"
    >
      <path d="M0 0h14v2.5H0zM0 5.75h14v2.5H0zM0 11.5h14V14H0z" />
    </svg>
  )
}

/** Sort ("Featured") and the grid/list switch above the product grid (Frame 138 + image 153). */
export function ListingToolbar({
  pathname,
  state,
  view,
  className,
}: {
  pathname: string
  state: ListingState
  view: ListingView
  className?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const requested = state.sort?.[0]
  const sort = SORT_OPTIONS.some((option) => option.value === requested)
    ? requested!
    : "featured"

  const views = [
    { value: "grid" as const, label: "Grid view", Glyph: GridGlyph },
    { value: "list" as const, label: "List view", Glyph: ListGlyph },
  ]

  return (
    <div
      className={cn(
        "flex items-start justify-end gap-5.75 3xl:pe-3.75",
        className
      )}
      aria-busy={pending}
    >
      {/* The site's dropdown (D-063, D-064): white list, lime on hover, the lime offset shadow kept. */}
      <div className="w-full max-w-90 min-w-0 rounded-lg shadow-offset-brand-sm">
        <Select
          items={sortLabels}
          value={sort}
          onValueChange={(value) => {
            if (!value || value === sort) return
            startTransition(() =>
              router.push(
                listingHref(pathname, state, {
                  sort: value === "featured" ? null : value,
                }),
                { scroll: false }
              )
            )
          }}
        >
          <SelectTrigger className="h-14 ps-4 pe-4 md:h-18 md:ps-5 md:pe-5">
            <span className="flex min-w-0 items-center gap-3">
              <SelectLabel className="sr-only shrink-0 text-14 font-bold tracking-wide-2 text-subtle-foreground uppercase sm:not-sr-only md:text-16">
                Sort by
              </SelectLabel>
              <SelectValue className="text-18 md:text-20" />
            </span>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex pt-0 md:pt-2.75">
        <ul
          aria-label="Layout"
          className="flex h-13.5 border border-border-subtle bg-background"
        >
          {views.map(({ value, label, Glyph }) => {
            const current = view === value
            return (
              <li key={value} className="flex">
                <Link
                  href={listingHref(pathname, state, {
                    view: value === "grid" ? null : value,
                    page: state.page ?? null,
                  })}
                  scroll={false}
                  replace
                  aria-label={label}
                  aria-current={current ? "true" : undefined}
                  className={cn(
                    "flex w-12.75 items-center justify-center transition-colors",
                    current
                      ? "bg-ink-control text-background"
                      : "text-faint-foreground hover:text-foreground"
                  )}
                >
                  <Glyph />
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
