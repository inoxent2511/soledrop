import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Shared heading for storefront sections. */
export function SectionTitle({ id, children, display = false }: { id: string; children: ReactNode; display?: boolean }) {
  return (
    <h2 id={id} className={cn("text-28 leading-[1.05] font-extrabold tracking-tight-1 uppercase sm:text-32 md:text-40 xl:text-44 3xl:text-50", display && "font-display")}>
      {children}
    </h2>
  )
}
