import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Shared heading for storefront sections. */
export function SectionTitle({ id, children, display = false }: { id: string; children: ReactNode; display?: boolean }) {
  return (
    <h2 id={id} className={cn("text-32 leading-none font-extrabold tracking-tight-1 uppercase md:text-44 xl:text-48 3xl:text-60", display && "font-display")}>
      {children}
    </h2>
  )
}
