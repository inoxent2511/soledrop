"use client"

import { Search, X } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useId, useRef, type FormEvent } from "react"

import { adminButton } from "@/components/admin/button"
import { adminControl } from "@/components/admin/form"
import { cn } from "@/lib/utils"

export type FilterField =
  | { kind: "select"; name: string; label: string; options: { value: string; label: string }[] }
  | { kind: "date"; name: string; label: string }

/**
 * Search box, typed filters and quick-view tabs synced to the URL (admin-design.md, FilterBar).
 * Changing a filter resets to page 1; `/` focuses the search from anywhere on the page.
 */
export function FilterBar({ searchLabel, fields, views }: { searchLabel: string; fields: FilterField[]; views?: { key: string; label: string }[] }) {
  const id = useId()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const search = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) && !target.isContentEditable) {
        event.preventDefault()
        search.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  function apply(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value)
      else merged.delete(key)
    }
    merged.delete("page")
    const query = merged.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    apply(Object.fromEntries([["q", String(data.get("q") ?? "").trim() || null], ...fields.map((field) => [field.name, String(data.get(field.name) ?? "") || null])]))
  }

  const currentView = params.get("view") ?? views?.[0]?.key
  const active = ["q", ...fields.map((field) => field.name)].some((key) => params.get(key))

  return (
    <div className="flex flex-col gap-3">
      {views ? (
        <nav aria-label="Views" className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
          {views.map((view) => {
            const merged = new URLSearchParams(params)
            merged.delete("page")
            merged.delete("status")
            if (view.key === views[0].key) merged.delete("view")
            else merged.set("view", view.key)
            const query = merged.toString()
            const selected = currentView === view.key
            return (
              <Link
                key={view.key}
                href={query ? `${pathname}?${query}` : pathname}
                aria-current={selected ? "page" : undefined}
                className={cn("flex h-10 items-center border-b-3 px-3 text-16 font-semibold whitespace-nowrap", selected ? "border-foreground text-foreground" : "border-transparent text-subtle-foreground hover:text-foreground")}
              >
                {view.label}
              </Link>
            )
          })}
        </nav>
      ) : null}
      <form role="search" onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" key={params.toString()}>
        <div className="flex min-w-60 flex-1 flex-col gap-1.5">
          <label htmlFor={`${id}-q`} className="text-14 font-bold">
            {searchLabel}
          </label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
            <input ref={search} id={`${id}-q`} name="q" type="search" defaultValue={params.get("q") ?? ""} placeholder="Press / to search" className={cn(adminControl, "ps-9")} />
          </div>
        </div>
        {fields.map((field) => (
          <div key={field.name} className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-${field.name}`} className="text-14 font-bold">
              {field.label}
            </label>
            {field.kind === "select" ? (
              <select id={`${id}-${field.name}`} name={field.name} defaultValue={params.get(field.name) ?? ""} className={cn(adminControl, "w-auto min-w-36")}>
                <option value="">Any</option>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input id={`${id}-${field.name}`} name={field.name} type="date" defaultValue={params.get(field.name) ?? ""} className={cn(adminControl, "w-auto")} />
            )}
          </div>
        ))}
        <button type="submit" className={adminButton({ tone: "primary" })}>
          Apply
        </button>
        {active ? (
          <button type="button" onClick={() => apply(Object.fromEntries(["q", ...fields.map((field) => field.name)].map((key) => [key, null])))} className={adminButton({ tone: "ghost" })}>
            <X aria-hidden /> Clear
          </button>
        ) : null}
      </form>
    </div>
  )
}
