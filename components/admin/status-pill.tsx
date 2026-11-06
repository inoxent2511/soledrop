import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type StatusTone = "success" | "pending" | "danger" | "neutral" | "info"

const tones: Record<StatusTone, string> = {
  success: "bg-success text-success-foreground",
  pending: "bg-brand-tint text-foreground",
  danger: "bg-destructive/12 text-destructive",
  neutral: "bg-surface-sunken text-foreground",
  info: "bg-foreground text-background",
}

/** A status word on its semantic colour; never colour alone (admin-design.md §4). */
export function StatusPill({ tone, children, className }: { tone: StatusTone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-14 font-semibold whitespace-nowrap", tones[tone], className)}>{children}</span>
}
