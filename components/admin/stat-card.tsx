import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** A KPI with an optional comparison line (admin-design.md, StatCard). */
export function StatCard({ label, value, comparison, trend }: { label: string; value: ReactNode; comparison?: string; trend?: "up" | "down" | "flat" }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-background p-4">
      <p className="text-14 text-subtle-foreground">{label}</p>
      <p className="text-24 font-extrabold tabular-nums">{value}</p>
      {comparison ? (
        <p className={cn("text-14", trend === "down" ? "text-destructive" : "text-subtle-foreground")}>
          {trend === "up" ? "▲ " : trend === "down" ? "▼ " : ""}
          {comparison}
        </p>
      ) : null}
    </div>
  )
}
