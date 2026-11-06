import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** A titled panel on the admin canvas. */
export function AdminCard({ title, description, actions, children, className }: { title?: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-background p-4 md:p-5", className)}>
      {title ? (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-18 font-bold">{title}</h2>
            {description ? <p className="text-14 text-subtle-foreground">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  )
}
