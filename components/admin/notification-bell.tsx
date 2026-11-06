"use client"

import { Popover } from "@base-ui/react/popover"
import { useQuery } from "@tanstack/react-query"
import { Bell } from "lucide-react"
import Link from "next/link"

import { request } from "@/api/http"
import { adminButton } from "@/components/admin/button"
import { StatusPill } from "@/components/admin/status-pill"
import { cn } from "@/lib/utils"
import type { AttentionItem } from "@/server/reports/insights"

/** The notification centre: what needs doing now, refreshed every minute. */
export function NotificationBell() {
  const items = useQuery({ queryKey: ["admin", "notifications"], queryFn: ({ signal }) => request<{ items: AttentionItem[] }>("/api/admin/notifications", { signal }), refetchInterval: 60_000 })
  const list = items.data?.items ?? []
  const total = list.reduce((sum, item) => sum + item.count, 0)
  return (
    <Popover.Root>
      <Popover.Trigger className={cn(adminButton({ tone: "ghost", size: "icon" }), "relative")} aria-label={total ? `Notifications: ${total} things need attention` : "Notifications"}>
        <Bell />
        {total ? <span className="absolute end-1 top-1 flex size-4.5 items-center justify-center rounded-full bg-destructive text-14 leading-none font-bold text-background">{total > 9 ? "9+" : total}</span> : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-overlay">
          <Popover.Popup className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-lg border border-border bg-background p-3 shadow-card-lift">
            <Popover.Title className="text-16 font-bold">Needs attention</Popover.Title>
            {list.length === 0 ? <p className="text-14 text-subtle-foreground">All clear.</p> : null}
            <ul className="flex flex-col">
              {list.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-16 hover:bg-surface">
                    <span>{item.label}</span>
                    <StatusPill tone={item.tone}>{item.count}</StatusPill>
                  </Link>
                </li>
              ))}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
