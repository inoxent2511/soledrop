"use client"

import { useRouter } from "next/navigation"
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react"

import { CheckIcon } from "@/components/icons"
import {
  hasFilters,
  listingHref,
  toggleValue,
  type ListingKey,
  type ListingState,
} from "@/features/catalog/lib/listing-url"
import type { FilterOptions } from "@/features/catalog/types/filters"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"

/** The Gender filter's choices; Kids was removed (D-067), and ?gender=kids is ignored. */
const GENDERS = [
  { value: "men", label: "Men" },
  { value: "women", label: "Women" },
]

/** Price slider steps in whole rupees. */
const PRICE_STEP = 500

type FiltersPanelProps = {
  pathname: string
  state: ListingState
  options: FilterOptions
}

/**
 * The listing's filter sidebar (Frame 140): gender, EU size, brand (searchable) and an upper price
 * limit. Every change is a navigation, so the URL stays the source of truth and the back button
 * undoes a filter. Below `lg` the panel folds behind a Filters button.
 */
export function FiltersPanel({ pathname, state, options }: FiltersPanelProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const active = hasFilters(state)
  const activeCount = (
    ["gender", "condition", "size", "brand", "max"] as const
  ).reduce((total, key) => total + (state[key]?.length ?? 0), 0)

  function apply(
    changes: Partial<Record<ListingKey, string[] | string | null>>
  ) {
    startTransition(() =>
      router.push(listingHref(pathname, state, changes), { scroll: false })
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex h-12 items-center justify-between rounded-2xl border-2 border-border bg-background px-4.5 text-18 font-semibold lg:hidden"
      >
        Filters{activeCount ? ` (${activeCount})` : ""}
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>

      <section
        id={panelId}
        aria-labelledby={`${panelId}-title`}
        aria-busy={pending}
        className={cn(
          "flex-col rounded-2xl bg-background px-5 pt-5 pb-6 outline-2 outline-border lg:flex lg:h-full",
          open ? "flex" : "hidden"
        )}
      >
        <div className="box-content flex h-6 items-center justify-between pb-8">
          <h2 id={`${panelId}-title`} className="text-20 font-semibold">
            Filters
          </h2>
          {active ? (
            <button
              type="button"
              onClick={() =>
                apply({
                  gender: null,
                  size: null,
                  brand: null,
                  min: null,
                  max: null,
                  condition: null,
                })
              }
              className="text-20 font-medium text-destructive hover:underline"
            >
              Clear All
            </button>
          ) : null}
        </div>

        <FilterGroup title="Gender">
          <ul className="flex flex-col gap-5.5">
            {GENDERS.map((gender) => (
              <li key={gender.value}>
                <Checkbox
                  label={gender.label}
                  checked={state.gender?.includes(gender.value) ?? false}
                  onChange={() =>
                    apply({ gender: toggleValue(state.gender, gender.value) })
                  }
                  className="gap-3.5"
                />
              </li>
            ))}
          </ul>
        </FilterGroup>

        {options.conditions?.length ? (
          <FilterGroup title="Condition">
            <ul className="flex flex-col gap-5.5">
              {options.conditions.map((condition) => (
                <li key={condition.value}>
                  <Checkbox
                    label={`${condition.label} (${condition.count})`}
                    checked={
                      state.condition?.includes(condition.value) ?? false
                    }
                    onChange={() =>
                      apply({
                        condition: toggleValue(
                          state.condition,
                          condition.value
                        ),
                      })
                    }
                    className="gap-3.5"
                  />
                </li>
              ))}
            </ul>
          </FilterGroup>
        ) : null}

        {options.sizes.length ? (
          <FilterGroup title="Size (EU)">
            <ul className="grid grid-cols-4 gap-2">
              {options.sizes.map((size) => {
                const checked = state.size?.includes(size) ?? false
                return (
                  <li key={size}>
                    <button
                      type="button"
                      aria-pressed={checked}
                      aria-label={`EU ${size}`}
                      onClick={() =>
                        apply({ size: toggleValue(state.size, size) })
                      }
                      className={cn(
                        "flex h-11 w-full items-center justify-center rounded-sm border text-20 font-medium transition-colors",
                        checked
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-background hover:border-foreground"
                      )}
                    >
                      {size}
                    </button>
                  </li>
                )
              })}
            </ul>
          </FilterGroup>
        ) : null}

        {options.brands.length ? (
          <BrandFilter
            brands={options.brands}
            selected={state.brand ?? []}
            onToggle={(value) =>
              apply({ brand: toggleValue(state.brand, value) })
            }
          />
        ) : null}

        {options.price.max > options.price.min ? (
          <PriceFilter
            key={state.max?.[0] ?? "none"}
            bounds={options.price}
            value={state.max?.[0] ? Number(state.max[0]) : null}
            onCommit={(max) =>
              apply({ max: max === null ? null : String(max) })
            }
          />
        ) : null}
      </section>
    </div>
  )
}

function FilterGroup({
  title,
  children,
  last = false,
  labelFor,
}: {
  title: string
  children: ReactNode
  last?: boolean
  labelFor?: string
}) {
  const id = useId()
  const Label = labelFor ? "label" : "h3"
  return (
    <div
      role={labelFor ? undefined : "group"}
      aria-labelledby={labelFor ? undefined : id}
      className={cn(
        "flex flex-col gap-5 border-t border-border pt-12 pb-11.75",
        last && "border-b"
      )}
    >
      <Label
        id={id}
        htmlFor={labelFor}
        className="text-18 font-semibold text-subtle-foreground"
      >
        {title}
      </Label>
      {children}
    </div>
  )
}

function Checkbox({
  label,
  checked,
  onChange,
  className,
}: {
  label: string
  checked: boolean
  onChange: () => void
  className?: string
}) {
  return (
    <label
      className={cn(
        "flex w-fit cursor-pointer items-center text-20 font-medium tracking-tight-1",
        className
      )}
    >
      <span className="relative flex size-7.5 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="peer size-7.5 cursor-pointer appearance-none rounded-xs border-2 border-control-border bg-background transition-colors checked:border checked:border-foreground checked:bg-foreground hover:border-foreground"
        />
        <CheckIcon className="pointer-events-none absolute start-1.25 top-2 hidden text-background peer-checked:block" />
      </span>
      {label}
    </label>
  )
}

function BrandFilter({
  brands,
  selected,
  onToggle,
}: {
  brands: FilterOptions["brands"]
  selected: string[]
  onToggle: (value: string) => void
}) {
  const [term, setTerm] = useState("")
  const searchId = useId()
  const needle = term.trim().toLowerCase()
  const visible = needle
    ? brands.filter((brand) => brand.label.toLowerCase().includes(needle))
    : brands

  return (
    <FilterGroup title="Brands">
      <div className="flex flex-col gap-5.5">
        <label htmlFor={searchId} className="sr-only">
          Search brands
        </label>
        <input
          id={searchId}
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search Brands"
          autoComplete="off"
          className="h-8.5 w-75 max-w-full rounded-xs border-2 border-subtle-foreground bg-background ps-2 pe-2 text-16 placeholder:text-faint-foreground"
        />
        {visible.length ? (
          <ul className="flex h-101 [scrollbar-color:var(--border-strong)_transparent] flex-col gap-5.5 overflow-y-auto overscroll-contain">
            {visible.map((brand) => (
              <li key={brand.value}>
                <Checkbox
                  label={brand.label}
                  checked={selected.includes(brand.value)}
                  onChange={() => onToggle(brand.value)}
                  className="gap-3"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p
            role="status"
            className="flex h-101 text-16 text-subtle-foreground"
          >
            No brands match “{term.trim()}”.
          </p>
        )}
      </div>
    </FilterGroup>
  )
}

function PriceFilter({
  bounds,
  value,
  onCommit,
}: {
  bounds: FilterOptions["price"]
  value: number | null
  onCommit: (max: number | null) => void
}) {
  const inputId = useId()
  const [draft, setDraft] = useState(value ?? bounds.max)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  function change(next: number) {
    setDraft(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(
      () => onCommit(next >= bounds.max ? null : next),
      450
    )
  }

  const label =
    draft >= bounds.max ? "Any price" : `Up to ${formatPrice(draft * 100)}`

  return (
    <FilterGroup title="Price Range" labelFor={inputId} last>
      <div className="flex flex-col gap-4 pt-5.5">
        <input
          id={inputId}
          type="range"
          min={bounds.min}
          max={bounds.max}
          step={PRICE_STEP}
          value={draft}
          aria-valuetext={label}
          onChange={(event) => change(Number(event.target.value))}
          className="h-6.5 w-full cursor-pointer appearance-none rounded-full bg-track px-0.75 [&::-moz-range-thumb]:box-border [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-control-border [&::-moz-range-thumb]:bg-background [&::-webkit-slider-thumb]:box-border [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-control-border [&::-webkit-slider-thumb]:bg-background"
        />
        <p className="flex justify-between text-16 font-medium text-subtle-foreground">
          <span>{formatPrice(bounds.min * 100)}</span>
          <span>{formatPrice(draft * 100)}</span>
        </p>
      </div>
    </FilterGroup>
  )
}
