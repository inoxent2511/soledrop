"use client"

import {
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react"

import type { SizeGuide, SizeGuideId, SizeTable } from "@/content/size-guide"
import { cn } from "@/lib/utils"

/** URL hash per guide, so a link can open the Pre-Loved tab (`/size-guide#pre-loved`). */
const HASH: Record<SizeGuideId, string> = {
  new: "brand-new",
  preloved: "pre-loved",
}

const subscribeToHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange)
  return () => window.removeEventListener("hashchange", onChange)
}

/**
 * Size Guide (D-058): Brand New / Pre-Loved tabs in the site's pill switch, each showing its own
 * men's and women's chart side by side from lg. ARIA tabs (arrow keys, Home/End, roving tab stop);
 * the chosen tab is kept in the URL hash, read after hydration so the server render stays neutral.
 */
export function SizeGuideTabs({ guides }: { guides: SizeGuide[] }) {
  const id = useId()
  // The server has no hash, so the first render is always Brand New; the client then follows the URL.
  const hash = useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash,
    () => ""
  )
  const [chosen, setChosen] = useState<SizeGuideId | null>(null)
  const active =
    chosen ??
    guides.find((guide) => `#${HASH[guide.id]}` === hash)?.id ??
    guides[0].id
  const tabs = useRef<(HTMLButtonElement | null)[]>([])

  const select = (guide: SizeGuideId) => {
    setChosen(guide)
    window.history.replaceState(window.history.state, "", `#${HASH[guide]}`)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = guides.findIndex((guide) => guide.id === active)
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl"
    const forward = rtl ? "ArrowLeft" : "ArrowRight"
    const back = rtl ? "ArrowRight" : "ArrowLeft"
    const next =
      event.key === forward
        ? (index + 1) % guides.length
        : event.key === back
          ? (index - 1 + guides.length) % guides.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? guides.length - 1
              : null
    if (next === null) return
    event.preventDefault()
    select(guides[next].id)
    tabs.current[next]?.focus()
  }

  return (
    <div className="flex w-full flex-col gap-6 md:gap-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div
          role="tablist"
          aria-label="Size guide"
          onKeyDown={onKeyDown}
          className="flex rounded-full border-2 border-border bg-background p-1.5 md:self-start"
        >
          {guides.map((guide, index) => {
            const selected = guide.id === active
            return (
              <button
                key={guide.id}
                ref={(node) => {
                  tabs.current[index] = node
                }}
                type="button"
                role="tab"
                id={`${id}-${guide.id}-tab`}
                aria-selected={selected}
                aria-controls={`${id}-${guide.id}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(guide.id)}
                className={cn(
                  "flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-4 text-16 font-bold whitespace-nowrap transition-colors md:min-w-50 md:flex-none md:px-6 md:text-20",
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
                {guide.label}
              </button>
            )
          })}
        </div>
        {guides.map((guide) =>
          guide.id === active ? (
            <p
              key={guide.id}
              className="font-display text-16 font-semibold text-subtle-foreground md:text-20"
            >
              {guide.summary}
            </p>
          ) : null
        )}
      </div>

      {guides.map((guide) => (
        <div
          key={guide.id}
          role="tabpanel"
          id={`${id}-${guide.id}-panel`}
          aria-labelledby={`${id}-${guide.id}-tab`}
          hidden={guide.id !== active}
          className="flex flex-col gap-6"
        >
          <p className="rounded-xl border-s-4 border-brand bg-background px-5 py-4 text-16 font-medium text-subtle-foreground md:text-18">
            {guide.note}
          </p>
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            {guide.tables.map((table) => (
              <ChartCard key={table.id} guide={guide} table={table} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ChartCard({ guide, table }: { guide: SizeGuide; table: SizeTable }) {
  const [heading, ...cells] = table.columns
  return (
    <section
      aria-label={`${guide.label} ${table.title.toLowerCase()}'s sizes`}
      className="overflow-hidden rounded-xl bg-background shadow-card-lift"
    >
      <div className="flex items-center justify-between gap-4 bg-foreground px-5 py-4 text-background md:px-6 md:py-5">
        <h3 className="font-display text-22 font-bold uppercase md:text-28">
          {table.title}
        </h3>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-14 font-bold",
            guide.id === "new"
              ? "bg-brand text-brand-foreground"
              : "border border-muted-foreground"
          )}
        >
          {guide.label}
        </span>
      </div>
      <table className="w-full table-fixed border-collapse font-display">
        <caption className="sr-only">
          {guide.label} {table.title.toLowerCase()}&apos;s shoe sizes:{" "}
          {table.columns.map((column) => column.label).join(", ")}
        </caption>
        <thead className="bg-surface-sunken">
          <tr>
            {table.columns.map((column, index) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "h-12 px-2 text-center align-middle text-14 font-bold uppercase md:text-16",
                  index === 0 ? "text-foreground" : "text-subtle-foreground"
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-t border-border bg-background transition-colors even:bg-surface-stripe hover:bg-brand-tint"
            >
              <th
                scope="row"
                className="h-12 px-2 text-center align-middle text-18 font-bold md:h-14 md:text-20"
              >
                {row[heading.key]}
              </th>
              {cells.map((column) => (
                <td
                  key={column.key}
                  className="px-2 text-center align-middle text-18 font-semibold text-subtle-foreground md:text-20"
                >
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
