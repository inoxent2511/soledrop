"use client"

import { Dialog } from "@base-ui/react/dialog"
import { useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useId, useState, type KeyboardEvent } from "react"

import { request } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { dialogBackdrop } from "@/components/admin/confirm-dialog"
import { adminControl } from "@/components/admin/form"
import { cn } from "@/lib/utils"
import type { CommandResult } from "@/server/reports/insights"

/**
 * ⌘K / Ctrl+K anywhere in the admin: jump to a page, an order, a product or a customer. Results
 * come from the server and only include what the member may open; arrows move, Enter opens.
 */
export function CommandPalette() {
  const id = useId()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [active, setActive] = useState(0)
  const [debounced, setDebounced] = useState("")

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q), 150)
    return () => clearTimeout(timer)
  }, [q])

  const results = useQuery({
    queryKey: ["admin", "command", debounced],
    queryFn: ({ signal }) => request<{ results: CommandResult[] }>(`/api/admin/command?q=${encodeURIComponent(debounced)}`, { signal }),
    enabled: open,
    placeholderData: (previous) => previous,
  })
  const items = results.data?.results ?? []

  const go = (item: CommandResult | undefined) => {
    if (!item) return
    setOpen(false)
    setQ("")
    router.push(item.href)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive((index) => Math.min(items.length - 1, index + 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive((index) => Math.max(0, index - 1))
    } else if (event.key === "Enter") {
      event.preventDefault()
      go(items[active])
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setActive(0)
      }}
    >
      <Dialog.Trigger className={cn(adminButton({ tone: "ghost", size: "sm" }), "hidden min-w-48 justify-between border border-border md:inline-flex")}>
        <span className="flex items-center gap-2 font-normal text-subtle-foreground">
          <Search aria-hidden /> Search or jump to…
        </span>
        <kbd className="text-14 text-faint-foreground">Ctrl K</kbd>
      </Dialog.Trigger>
      <Dialog.Trigger className={cn(adminButton({ tone: "ghost", size: "icon" }), "md:hidden")} aria-label="Search the admin">
        <Search />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogBackdrop} />
        <Dialog.Popup className="fixed start-1/2 top-20 z-overlay flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-col gap-2 rounded-lg bg-background p-3 shadow-card-lift rtl:translate-x-1/2">
          <Dialog.Title className="sr-only">Search the admin</Dialog.Title>
          <input
            id={`${id}-q`}
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-results`}
            aria-activedescendant={items[active] ? `${id}-item-${active}` : undefined}
            aria-label="Search pages, orders, products and customers"
            placeholder="Order number, product, customer email, or a page…"
            value={q}
            onChange={(event) => {
              setQ(event.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            className={adminControl}
          />
          <ul id={`${id}-results`} role="listbox" aria-label="Results" className="flex max-h-96 flex-col overflow-y-auto">
            {items.length === 0 && results.isFetched ? <li className="px-3 py-2 text-14 text-subtle-foreground">Nothing found.</li> : null}
            {items.map((item, index) => (
              <li
                key={`${item.group}-${item.href}`}
                id={`${id}-item-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(item)}
                className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2", index === active ? "bg-surface-sunken" : "")}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-16 font-semibold">{item.label}</span>
                  {item.detail ? <span className="truncate text-14 text-subtle-foreground">{item.detail}</span> : null}
                </span>
                <span className="text-14 text-faint-foreground">{item.group}</span>
              </li>
            ))}
          </ul>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
