import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

/** What this list is, why it's empty, and the first thing to do. */
export function EmptyState({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border px-6 py-12 text-center">
      {Icon ? <Icon aria-hidden className="size-8 text-subtle-foreground" /> : null}
      <h2 className="text-18 font-bold">{title}</h2>
      {children ? <div className="max-w-md text-16 text-subtle-foreground">{children}</div> : null}
      {action}
    </div>
  )
}
