import type { ReactNode } from "react"

export type TimelineEvent = { id: string; at: string; title: ReactNode; detail?: ReactNode; actor?: string }

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" })

/** Dated events, newest first (order history, notes, payments, audit). */
export function Timeline({ events, label }: { events: TimelineEvent[]; label: string }) {
  const sorted = [...events].sort((a, b) => b.at.localeCompare(a.at))
  return (
    <ol aria-label={label} className="flex flex-col">
      {sorted.map((event) => (
        <li key={event.id} className="relative flex gap-3 pb-5 ps-1 last:pb-0">
          <span aria-hidden className="relative mt-1.5 flex size-2.5 shrink-0 rounded-full bg-foreground" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-16 font-semibold">{event.title}</p>
            {event.detail ? <div className="text-14 break-words text-subtle-foreground">{event.detail}</div> : null}
            <p className="text-14 text-faint-foreground">
              <time dateTime={event.at}>{when(event.at)}</time>
              {event.actor ? ` · ${event.actor}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
