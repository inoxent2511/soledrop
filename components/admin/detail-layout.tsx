import type { ReactNode } from "react"

/** A main column and a sticky side column (status, customer, totals, actions) from `lg`. */
export function DetailLayout({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">{main}</div>
      <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-20">{side}</aside>
    </div>
  )
}
